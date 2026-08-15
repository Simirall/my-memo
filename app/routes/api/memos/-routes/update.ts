import { and, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { getAppDb } from "@/features/access-control/authorization";
import {
  getAttachmentPreviewKind,
  MAX_ATTACHMENTS_PER_MEMO,
  parseMediaDimensions,
} from "@/features/attachments/model/attachment-constants";
import { getAttachmentQuota } from "@/features/attachments/server/attachments";
import { normalizeLinkPreviewUrl } from "@/features/link-preview/model/link-preview";
import { refreshLinkPreviewCache } from "@/features/link-preview/server/link-preview-cache";
import { memoSchema } from "@/features/memos/schema/memo-schema";
import {
  MAX_MEMO_UPDATE_JSON_BYTES,
  readLimitedJson,
} from "@/routes/api/memos/-lib/read-limited-json";
import { categoriesTable, memoAttachmentsTable, memosTable } from "@/schema";
import { cleanupR2Keys, isEditAttachmentToken } from "../-lib/attachments";

const updateRoute = new Hono<{ Bindings: CloudflareBindings }>();

updateRoute.patch("/:id", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ message: "認証が必要です。" }, 401);

  const body = await readLimitedJson(c.req.raw, MAX_MEMO_UPDATE_JSON_BYTES);
  if (!body.ok) {
    return c.json(
      {
        message:
          body.reason === "too_large"
            ? "更新内容が大きすぎます。"
            : "入力内容が不正です。",
      },
      body.reason === "too_large" ? 413 : 400,
    );
  }

  const memoId = c.req.param("id");
  const db = getAppDb(c.env);
  const memo = await db
    .select()
    .from(memosTable)
    .where(and(eq(memosTable.id, memoId), eq(memosTable.userId, user.id)))
    .get();
  if (!memo) return c.json({ message: "メモが見つかりません。" }, 404);

  const parsed = memoSchema.update.safeParse(body.value);
  if (!parsed.success) {
    return c.json(
      { message: parsed.error.issues[0]?.message ?? "入力内容が不正です。" },
      400,
    );
  }
  const validated = parsed.data;
  const staged = validated.stagedAttachments;
  const stagedKeys = staged.flatMap((attachment) => {
    if (!isEditAttachmentToken(attachment.token, user.id, memoId)) return [];
    return attachment.thumbnailToken === `${attachment.token}.thumbnail`
      ? [attachment.token, attachment.thumbnailToken]
      : [attachment.token];
  });
  if (
    new Set(staged.map((attachment) => attachment.reservationId)).size !==
    staged.length
  ) {
    await cleanupR2Keys(c.env.MY_MEMO_FILES, stagedKeys, {
      event: "memo_edit_attachment_cleanup_failed",
      memoId,
    });
    return c.json({ message: "添付ファイルの予約が重複しています。" }, 400);
  }
  const cleanupStaged = () =>
    cleanupR2Keys(c.env.MY_MEMO_FILES, stagedKeys, {
      event: "memo_edit_attachment_cleanup_failed",
      memoId,
    });

  if (new Set(stagedKeys).size !== stagedKeys.length) {
    await cleanupStaged();
    return c.json({ message: "添付ファイルが重複しています。" }, 400);
  }
  if (
    staged.some(
      (attachment) =>
        !isEditAttachmentToken(attachment.token, user.id, memoId) ||
        (attachment.thumbnailToken !== null &&
          attachment.thumbnailToken !== `${attachment.token}.thumbnail`),
    )
  ) {
    await cleanupStaged();
    return c.json({ message: "添付ファイルの更新IDが不正です。" }, 400);
  }
  try {
    for (const attachment of staged) {
      parseMediaDimensions(
        attachment.contentType,
        attachment.mediaWidth == null ? null : String(attachment.mediaWidth),
        attachment.mediaHeight == null ? null : String(attachment.mediaHeight),
      );
      const isImage =
        getAttachmentPreviewKind(attachment.contentType) === "image";
      if (
        isImage !== Boolean(attachment.thumbnailToken) ||
        isImage !== Boolean(attachment.thumbnailContentType) ||
        isImage !== Boolean(attachment.thumbnailSizeBytes)
      ) {
        throw new Error("画像のサムネイル情報が不正です。");
      }
    }
  } catch (error) {
    await cleanupStaged();
    return c.json(
      {
        message:
          error instanceof Error ? error.message : "添付寸法が不正です。",
      },
      400,
    );
  }

  const categoryId = validated.categoryId ?? null;
  if (categoryId) {
    const category = await db
      .select({ id: categoriesTable.id })
      .from(categoriesTable)
      .where(
        and(
          eq(categoriesTable.id, categoryId),
          eq(categoriesTable.userId, user.id),
        ),
      )
      .get();
    if (!category) {
      await cleanupStaged();
      return c.json({ message: "カテゴリが見つかりません。" }, 400);
    }
  }

  const currentAttachments = await db
    .select()
    .from(memoAttachmentsTable)
    .where(
      and(
        eq(memoAttachmentsTable.memoId, memoId),
        eq(memoAttachmentsTable.userId, user.id),
      ),
    );
  const deleteIds = [...new Set(validated.deleteAttachmentIds)];
  const currentById = new Map(
    currentAttachments.map((attachment) => [attachment.id, attachment]),
  );
  if (deleteIds.some((id) => !currentById.has(id))) {
    await cleanupStaged();
    return c.json({ message: "削除対象の添付が見つかりません。" }, 400);
  }
  const keptAttachments = currentAttachments.filter(
    (attachment) => !deleteIds.includes(attachment.id),
  );
  const finalCount = keptAttachments.length + staged.length;
  const finalBytes =
    keptAttachments.reduce(
      (total, attachment) => total + attachment.sizeBytes,
      0,
    ) + staged.reduce((total, attachment) => total + attachment.sizeBytes, 0);
  if (finalCount > MAX_ATTACHMENTS_PER_MEMO) {
    await cleanupStaged();
    return c.json({ message: "1メモに添付できるファイルは5件までです。" }, 409);
  }
  const quota = await getAttachmentQuota(db, user.id);
  if (!quota) {
    await cleanupStaged();
    return c.json({ message: "添付容量の上限設定がありません。" }, 500);
  }
  const totalUserBytes = await db
    .select({
      total: sql<number>`coalesce(sum(${memoAttachmentsTable.sizeBytes}), 0)`,
    })
    .from(memoAttachmentsTable)
    .where(eq(memoAttachmentsTable.userId, user.id))
    .get();
  const finalUserBytes =
    Number(totalUserBytes?.total ?? 0) -
    deleteIds.reduce(
      (total, id) => total + (currentById.get(id)?.sizeBytes ?? 0),
      0,
    ) +
    staged.reduce((total, attachment) => total + attachment.sizeBytes, 0);
  if (
    finalBytes < 0 ||
    finalBytes > Number.MAX_SAFE_INTEGER ||
    (quota.limit !== null && finalUserBytes > quota.limit)
  ) {
    await cleanupStaged();
    return c.json({ message: "添付容量の残りが足りません。" }, 409);
  }

  const stagedObjects = await Promise.all(
    staged.map(async (attachment) => ({
      ...attachment,
      object: await c.env.MY_MEMO_FILES.head(attachment.token),
      thumbnailObject: attachment.thumbnailToken
        ? await c.env.MY_MEMO_FILES.head(attachment.thumbnailToken)
        : null,
    })),
  );
  if (
    stagedObjects.some(
      ({
        object,
        sizeBytes,
        etag,
        thumbnailToken,
        thumbnailObject,
        thumbnailSizeBytes,
      }) =>
        !object ||
        object.size !== sizeBytes ||
        object.etag !== etag ||
        (thumbnailToken &&
          (!thumbnailObject || thumbnailObject.size !== thumbnailSizeBytes)),
    )
  ) {
    await cleanupStaged();
    return c.json({ message: "確定前の添付が見つかりません。" }, 400);
  }

  const statements = [
    c.env.MY_MEMO_D1.prepare(
      `UPDATE memos
         SET title = ?, content = ?, url = ?, category_id = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND user_id = ?`,
    ).bind(
      validated.title,
      validated.content,
      validated.url ?? null,
      categoryId,
      memoId,
      user.id,
    ),
    c.env.MY_MEMO_D1.prepare("DELETE FROM memo_tags WHERE memo_id = ?").bind(
      memoId,
    ),
  ];
  for (const name of validated.tags) {
    statements.push(
      c.env.MY_MEMO_D1.prepare(
        `INSERT INTO tags (id, user_id, name)
           VALUES (?, ?, ?)
           ON CONFLICT(user_id, name) DO NOTHING`,
      ).bind(crypto.randomUUID(), user.id, name),
    );
  }
  for (const name of validated.tags) {
    statements.push(
      c.env.MY_MEMO_D1.prepare(
        `INSERT INTO memo_tags (memo_id, tag_id)
           SELECT ?, id FROM tags WHERE user_id = ? AND name = ?`,
      ).bind(memoId, user.id, name),
    );
  }
  for (const id of deleteIds) {
    statements.push(
      c.env.MY_MEMO_D1.prepare(
        "DELETE FROM memo_attachments WHERE id = ? AND memo_id = ? AND user_id = ?",
      ).bind(id, memoId, user.id),
    );
  }
  for (const attachment of staged) {
    statements.push(
      c.env.MY_MEMO_D1.prepare(
        `INSERT INTO memo_attachments
           (id, memo_id, user_id, r2_key, thumbnail_r2_key, thumbnail_content_type, thumbnail_size_bytes, file_name, content_type, size_bytes, media_width, media_height, etag)
           SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
           FROM attachment_upload_reservations AS r
           WHERE r.id = ? AND r.user_id = ? AND r.memo_id = ?
             AND r.r2_key = ?
             AND COALESCE(r.thumbnail_r2_key, '') = COALESCE(?, '')
             AND r.size_bytes = ? AND r.status = 'pending' AND r.expires_at > ?`,
      ).bind(
        crypto.randomUUID(),
        memoId,
        user.id,
        attachment.token,
        attachment.thumbnailToken,
        attachment.thumbnailContentType,
        attachment.thumbnailSizeBytes,
        attachment.fileName,
        attachment.contentType,
        attachment.sizeBytes,
        attachment.mediaWidth,
        attachment.mediaHeight,
        attachment.etag,
        attachment.reservationId,
        user.id,
        memoId,
        attachment.token,
        attachment.thumbnailToken,
        attachment.sizeBytes,
        new Date().toISOString(),
      ),
    );
  }
  for (const attachment of staged) {
    statements.push(
      c.env.MY_MEMO_D1.prepare(
        `DELETE FROM attachment_upload_reservations
         WHERE id = ? AND user_id = ?
           AND EXISTS (SELECT 1 FROM memo_attachments WHERE r2_key = ?)`,
      ).bind(attachment.reservationId, user.id, attachment.token),
    );
  }

  try {
    const results = await c.env.MY_MEMO_D1.batch(statements);
    const reservationResults = staged.length
      ? results.slice(-staged.length)
      : [];
    if (
      results[0]?.meta.changes !== 1 ||
      reservationResults.some((result) => result.meta.changes !== 1)
    ) {
      await cleanupStaged();
      return c.json({ message: "メモを更新できませんでした。" }, 409);
    }
  } catch (error) {
    await cleanupStaged();
    console.error(
      JSON.stringify({
        event: "memo_update_failed",
        memoId,
        errorType: error instanceof Error ? error.name : "UnknownError",
      }),
    );
    return c.json({ message: "メモを更新できませんでした。" }, 500);
  }

  await cleanupR2Keys(
    c.env.MY_MEMO_FILES,
    deleteIds
      .flatMap((id) => {
        const attachment = currentById.get(id);
        return [attachment?.r2Key, attachment?.thumbnailR2Key];
      })
      .filter((key): key is string => Boolean(key)),
    { event: "memo_edit_attachment_delete_failed", memoId },
  );
  const previewUrl = validated.url;
  if (
    previewUrl &&
    normalizeLinkPreviewUrl(previewUrl) !==
      (memo.url ? normalizeLinkPreviewUrl(memo.url) : null)
  ) {
    await refreshLinkPreviewCache(c.env.MY_MEMO_D1, previewUrl);
  }
  return c.json({ ok: true, redirect: "/" });
});

export default updateRoute;
