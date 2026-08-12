import { zValidator } from "@hono/zod-validator";
import { and, asc, eq, sql } from "drizzle-orm";
import type { Context } from "hono";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import {
  currentUtcMonthStart,
  getAppDb,
  getEntitlement,
  getUsage,
  PLAN_METRICS,
} from "@/features/access-control/authorization";
import {
  insertMemoWithinQuota,
  insertReservedAttachment,
  releaseAiSummaryQuota,
  reserveAiSummaryQuota,
} from "@/features/access-control/quota";
import {
  getAttachmentPreviewKind,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS_PER_MEMO,
  parseMediaDimensions,
} from "@/features/attachments/model/attachment-constants";
import { parseAttachmentUploadForm } from "@/features/attachments/server/attachment-upload";
import { getAttachmentQuota } from "@/features/attachments/server/attachments";
import {
  enqueueMemoDeletion,
  processR2DeletionJobs,
} from "@/features/attachments/server/r2-deletion-jobs";
import { putR2ObjectWithKnownLength } from "@/features/attachments/server/r2-upload";
import {
  releaseAttachmentReservation,
  releaseReservationsByKeys,
  reserveAttachmentUpload,
} from "@/features/attachments/server/upload-reservations";
import { normalizeLinkPreviewUrl } from "@/features/link-preview/model/link-preview";
import { scheduleBackgroundTask } from "@/features/link-preview/server/background-task";
import { decodeLinkPreviewHtml } from "@/features/link-preview/server/decode-html";
import { fetchPublicHtml } from "@/features/link-preview/server/fetch-public-html";
import { refreshLinkPreviewCache } from "@/features/link-preview/server/link-preview-cache";
import {
  memoSchema,
  tagUpdateSchema,
} from "@/features/memos/schema/memo-schema";
import { normalizeTagNames, replaceMemoTags } from "@/features/tags/data/tags";
import {
  MAX_MEMO_UPDATE_JSON_BYTES,
  readLimitedJson,
} from "@/routes/api/memos/-lib/read-limited-json";
import {
  categoriesTable,
  memoAttachmentsTable,
  memosTable,
  memoTagsTable,
  tagsTable,
} from "@/schema";
import { decodeHtmlEntities } from "./-lib/decode-html-entities";

const memosRoute = new Hono<{ Bindings: CloudflareBindings }>();
type MemosContext = Context<{ Bindings: CloudflareBindings }>;

const wantsStream = (c: MemosContext) =>
  c.req.header("Accept")?.includes("text/event-stream") ?? false;

const jsonError = (
  c: MemosContext,
  code: string,
  message: string,
  status: 400 | 403 | 406,
) => c.json({ code, message }, status);

const cleanupR2Keys = async (
  bucket: R2Bucket,
  keys: readonly string[],
  context: { memoId: string; event: string },
) => {
  const results = await Promise.allSettled(
    keys.map((key) => bucket.delete(key)),
  );
  for (const result of results) {
    if (result.status === "rejected") {
      console.error(
        JSON.stringify({
          event: context.event,
          memoId: context.memoId,
          errorType:
            result.reason instanceof Error
              ? result.reason.name
              : "UnknownError",
        }),
      );
    }
  }
};

const getEditAttachmentPrefix = (userId: string, memoId: string) =>
  `users/${userId}/memos/${memoId}/edits/`;

const isEditAttachmentToken = (
  token: string,
  userId: string,
  memoId: string,
) => {
  const prefix = getEditAttachmentPrefix(userId, memoId);
  const suffix = token.startsWith(prefix) ? token.slice(prefix.length) : "";
  return suffix.split("/").length === 2 && suffix.split("/").every(Boolean);
};

type UrlSummaryFailure = {
  code: string;
  message: string;
};

type UrlSummaryResult =
  | { ok: true }
  | { ok: false; failure: UrlSummaryFailure };

type SummaryStreamPayload = {
  message?: string;
  text?: string;
};

type SummaryStreamEventWriter = (
  event: "chunk" | "status",
  payload: SummaryStreamPayload,
) => Promise<void>;

type WorkersAiStreamPayload = {
  type?: unknown;
  delta?: unknown;
  response?: unknown;
  choices?: Array<{
    delta?: { content?: unknown };
    message?: { content?: unknown };
  }>;
};

const getWorkersAiText = (payload: unknown) => {
  if (!payload || typeof payload !== "object") return "";

  const typedPayload = payload as WorkersAiStreamPayload;
  if (
    typedPayload.type === "response.output_text.delta" &&
    typeof typedPayload.delta === "string"
  ) {
    return typedPayload.delta;
  }

  if (typeof typedPayload.response === "string") {
    return typedPayload.response;
  }

  const firstChoice = typedPayload.choices?.[0];
  const deltaContent = firstChoice?.delta?.content;
  if (typeof deltaContent === "string") return deltaContent;

  const messageContent = firstChoice?.message?.content;
  return typeof messageContent === "string" ? messageContent : "";
};

const readWorkersAiTextStream = async (
  aiStream: ReadableStream,
  onText: (text: string) => Promise<void>,
) => {
  const reader = aiStream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let summary = "";

  const emitData = async (data: string) => {
    const trimmed = data.trim();
    if (!trimmed || trimmed === "[DONE]") return;

    let payload: unknown;
    try {
      payload = JSON.parse(trimmed);
    } catch {
      return;
    }

    const text = getWorkersAiText(payload);
    if (!text) return;

    summary += text;
    await onText(text);
  };

  const emitEvent = async (event: string) => {
    const data = event
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice("data:".length).trimStart())
      .join("\n");
    await emitData(data);
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      if (value instanceof Uint8Array) {
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split(/\r?\n\r?\n/);
        buffer = events.pop() ?? "";
        for (const event of events) {
          await emitEvent(event);
        }
        continue;
      }

      const text = getWorkersAiText(value);
      if (text) {
        summary += text;
        await onText(text);
      }
    }

    buffer += decoder.decode();
    if (buffer.trim()) await emitEvent(buffer);
  } finally {
    reader.releaseLock();
  }

  return summary;
};

memosRoute
  .post("/create", zValidator("form", memoSchema.create), async (c) => {
    const user = c.get("user");
    if (!user) return c.redirect("/login");
    const db = getAppDb(c.env);

    const validated = c.req.valid("form");
    const entitlement = await getEntitlement(
      db,
      user.id,
      PLAN_METRICS.memoTotal,
    );
    if (!entitlement) {
      return jsonError(
        c,
        "PLAN_CONFIGURATION_ERROR",
        "プランのメモ上限が設定されていません。",
        403,
      );
    }

    const usage = await getUsage(db, user.id, PLAN_METRICS.memoTotal);
    if (entitlement.limit !== null && usage >= entitlement.limit) {
      return jsonError(
        c,
        "QUOTA_EXCEEDED",
        `メモの上限（${entitlement.limit}件）に達しています。`,
        403,
      );
    }

    const memoId = crypto.randomUUID();
    const inserted = await insertMemoWithinQuota(c.env.MY_MEMO_D1, {
      id: memoId,
      userId: user.id,
      title: validated.title,
      content: validated.content,
      url: validated.url ?? null,
      categoryId: validated.categoryId ?? null,
      isAiSummary: 0,
      tags: validated.tags,
    });
    if (!inserted) {
      return jsonError(
        c,
        "QUOTA_EXCEEDED",
        "メモの上限に達しました。最新の利用状況を確認してください。",
        403,
      );
    }

    const previewUrl = validated.url;
    if (previewUrl) {
      scheduleBackgroundTask(
        () => c.executionCtx,
        () => refreshLinkPreviewCache(c.env.MY_MEMO_D1, previewUrl),
      );
    }

    return c.json({ memoId });
  })
  .post("/:id/edit-attachments", async (c) => {
    const user = c.get("user");
    if (!user) return c.json({ message: "認証が必要です。" }, 401);

    const memoId = c.req.param("id");
    const db = getAppDb(c.env);
    const memo = await db
      .select({ id: memosTable.id })
      .from(memosTable)
      .where(and(eq(memosTable.id, memoId), eq(memosTable.userId, user.id)))
      .get();
    if (!memo) return c.json({ message: "メモが見つかりません。" }, 404);

    const editId = c.req.header("X-Edit-Id");
    if (!editId) {
      return c.json({ message: "添付ファイル情報が不正です。" }, 400);
    }
    if (!/^[a-zA-Z0-9-]{1,80}$/.test(editId)) {
      return c.json({ message: "更新IDが不正です。" }, 400);
    }
    let upload: Awaited<ReturnType<typeof parseAttachmentUploadForm>>;
    try {
      upload = await parseAttachmentUploadForm(c.req.raw);
    } catch (error) {
      return c.json(
        {
          message:
            error instanceof Error ? error.message : "添付寸法が不正です。",
        },
        400,
      );
    }
    const token = `${getEditAttachmentPrefix(user.id, memoId)}${editId}/${crypto.randomUUID()}`;
    const thumbnailToken = upload.thumbnail ? `${token}.thumbnail` : null;
    const reservation = await reserveAttachmentUpload(c.env.MY_MEMO_D1, {
      userId: user.id,
      memoId,
      r2Key: token,
      thumbnailR2Key: thumbnailToken,
      sizeBytes: upload.original.size,
    });
    if (!reservation) {
      return c.json(
        { message: "添付容量またはファイル数の上限に達しました。" },
        409,
      );
    }
    try {
      const object = await putR2ObjectWithKnownLength(
        c.env.MY_MEMO_FILES,
        token,
        upload.original.stream(),
        upload.original.size,
        {
          httpMetadata: {
            contentType: upload.contentType,
          },
        },
      );
      const thumbnailObject =
        upload.thumbnail && thumbnailToken
          ? await putR2ObjectWithKnownLength(
              c.env.MY_MEMO_FILES,
              thumbnailToken,
              upload.thumbnail.stream(),
              upload.thumbnail.size,
              { httpMetadata: { contentType: upload.thumbnail.type } },
            )
          : null;
      if (
        object.size !== upload.original.size ||
        (upload.thumbnail && thumbnailObject?.size !== upload.thumbnail.size)
      ) {
        await cleanupR2Keys(
          c.env.MY_MEMO_FILES,
          [token, thumbnailToken].filter((key): key is string => Boolean(key)),
          {
            event: "memo_edit_attachment_size_mismatch_cleanup_failed",
            memoId,
          },
        );
        await releaseAttachmentReservation(
          c.env.MY_MEMO_D1,
          user.id,
          reservation.id,
        );
        return c.json(
          { message: "ファイルサイズを確認できませんでした。" },
          400,
        );
      }
      return c.json({
        attachment: {
          reservationId: reservation.id,
          token,
          thumbnailToken,
          thumbnailContentType: upload.thumbnail?.type ?? null,
          thumbnailSizeBytes: thumbnailObject?.size ?? null,
          fileName: upload.fileName,
          contentType: upload.contentType,
          sizeBytes: object.size,
          mediaWidth: upload.mediaDimensions?.width ?? null,
          mediaHeight: upload.mediaDimensions?.height ?? null,
          etag: object.etag,
        },
      });
    } catch (error) {
      await cleanupR2Keys(
        c.env.MY_MEMO_FILES,
        [token, thumbnailToken].filter((key): key is string => Boolean(key)),
        {
          event: "memo_edit_attachment_upload_cleanup_failed",
          memoId,
        },
      );
      await releaseAttachmentReservation(
        c.env.MY_MEMO_D1,
        user.id,
        reservation.id,
      );
      console.error(
        JSON.stringify({
          event: "memo_edit_attachment_upload_failed",
          memoId,
          errorType: error instanceof Error ? error.name : "UnknownError",
        }),
      );
      return c.json(
        { message: "ファイルをアップロードできませんでした。" },
        502,
      );
    }
  })
  .post("/:id/edit-attachments/cleanup", async (c) => {
    const user = c.get("user");
    if (!user) return c.json({ message: "認証が必要です。" }, 401);
    const memoId = c.req.param("id");
    const body = (await c.req.json().catch(() => null)) as {
      tokens?: unknown;
    } | null;
    const tokens = Array.isArray(body?.tokens)
      ? body.tokens.filter(
          (token): token is string => typeof token === "string",
        )
      : [];
    const allowed = tokens.filter((token) =>
      isEditAttachmentToken(token, user.id, memoId),
    );
    await cleanupR2Keys(c.env.MY_MEMO_FILES, allowed, {
      event: "memo_edit_attachment_cleanup_failed",
      memoId,
    });
    await releaseReservationsByKeys(c.env.MY_MEMO_D1, user.id, allowed);
    return c.json({ ok: true });
  })
  .patch("/:id", async (c) => {
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
          attachment.mediaHeight == null
            ? null
            : String(attachment.mediaHeight),
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
      return c.json(
        { message: "1メモに添付できるファイルは5件までです。" },
        409,
      );
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
      scheduleBackgroundTask(
        () => c.executionCtx,
        () => refreshLinkPreviewCache(c.env.MY_MEMO_D1, previewUrl),
      );
    }
    return c.json({ ok: true, redirect: "/" });
  })
  .post("/:id/attachments", async (c) => {
    const user = c.get("user");
    if (!user) return c.json({ message: "認証が必要です。" }, 401);

    const memoId = c.req.param("id");
    const db = getAppDb(c.env);
    const memo = await db
      .select({ id: memosTable.id })
      .from(memosTable)
      .where(and(eq(memosTable.id, memoId), eq(memosTable.userId, user.id)))
      .get();
    if (!memo) return c.json({ message: "メモが見つかりません。" }, 404);

    let upload: Awaited<ReturnType<typeof parseAttachmentUploadForm>>;
    try {
      upload = await parseAttachmentUploadForm(c.req.raw);
    } catch (error) {
      return c.json(
        {
          message:
            error instanceof Error ? error.message : "添付ファイルが不正です。",
        },
        400,
      );
    }
    const declaredSize = upload.original.size;

    const count = await db
      .select({ count: sql<number>`count(*)` })
      .from(memoAttachmentsTable)
      .where(eq(memoAttachmentsTable.memoId, memoId))
      .get();
    if (Number(count?.count ?? 0) >= MAX_ATTACHMENTS_PER_MEMO) {
      return c.json(
        { message: "1メモに添付できるファイルは5件までです。" },
        409,
      );
    }

    const quota = await getAttachmentQuota(db, user.id);
    if (!quota) {
      return c.json(
        {
          code: "PLAN_CONFIGURATION_ERROR",
          message: "添付容量の上限設定がありません。",
        },
        500,
      );
    }
    if (
      quota.remaining !== null &&
      Number.isFinite(declaredSize) &&
      declaredSize > quota.remaining
    ) {
      return c.json({ message: "添付容量の残りが足りません。" }, 409);
    }

    const r2Key = `users/${user.id}/memos/${memoId}/${crypto.randomUUID()}`;
    const thumbnailR2Key = upload.thumbnail ? `${r2Key}.thumbnail` : null;
    const reservation = await reserveAttachmentUpload(c.env.MY_MEMO_D1, {
      userId: user.id,
      memoId,
      r2Key,
      thumbnailR2Key,
      sizeBytes: declaredSize,
    });
    if (!reservation) {
      return c.json(
        { message: "添付容量またはファイル数の上限に達しました。" },
        409,
      );
    }
    const cleanup = async () => {
      await cleanupR2Keys(
        c.env.MY_MEMO_FILES,
        [r2Key, thumbnailR2Key].filter((key): key is string => Boolean(key)),
        {
          event: "memo_attachment_cleanup_failed",
          memoId,
        },
      );
      await releaseAttachmentReservation(
        c.env.MY_MEMO_D1,
        user.id,
        reservation.id,
      );
    };

    let object: R2Object;
    try {
      object = await putR2ObjectWithKnownLength(
        c.env.MY_MEMO_FILES,
        r2Key,
        upload.original.stream(),
        declaredSize,
        {
          httpMetadata: {
            contentType: upload.contentType,
          },
        },
      );
      if (upload.thumbnail && thumbnailR2Key) {
        await putR2ObjectWithKnownLength(
          c.env.MY_MEMO_FILES,
          thumbnailR2Key,
          upload.thumbnail.stream(),
          upload.thumbnail.size,
          { httpMetadata: { contentType: upload.thumbnail.type } },
        );
      }
    } catch (error) {
      await cleanup();
      console.error(
        JSON.stringify({
          event: "memo_attachment_upload_failed",
          memoId,
          errorType: error instanceof Error ? error.name : "UnknownError",
        }),
      );
      return c.json(
        { message: "ファイルをアップロードできませんでした。" },
        502,
      );
    }

    if (object.size !== declaredSize) {
      await cleanup();
      console.error(
        JSON.stringify({
          event: "memo_attachment_size_mismatch",
          memoId,
          declaredSize,
          actualSize: object.size,
        }),
      );
      return c.json({ message: "ファイルサイズを確認できませんでした。" }, 400);
    }

    if (object.size > MAX_ATTACHMENT_BYTES) {
      await cleanup();
      return c.json({ message: "1ファイルは25 MiB以下にしてください。" }, 413);
    }

    let insertedAttachment = false;
    try {
      insertedAttachment = await insertReservedAttachment(
        c.env.MY_MEMO_D1,
        {
          id: crypto.randomUUID(),
          memoId,
          userId: user.id,
          r2Key,
          thumbnailR2Key,
          thumbnailContentType: upload.thumbnail?.type ?? null,
          thumbnailSizeBytes: upload.thumbnail?.size ?? null,
          fileName: upload.fileName,
          contentType: upload.contentType,
          sizeBytes: object.size,
          mediaWidth: upload.mediaDimensions?.width ?? null,
          mediaHeight: upload.mediaDimensions?.height ?? null,
          etag: object.etag,
        },
        reservation.id,
      );
    } catch (error) {
      await cleanup();
      console.error(
        JSON.stringify({
          event: "memo_attachment_record_failed",
          memoId,
          errorType: error instanceof Error ? error.name : "UnknownError",
        }),
      );
      return c.json({ message: "添付ファイルを記録できませんでした。" }, 502);
    }
    if (!insertedAttachment) {
      await cleanup();
      return c.json(
        { message: "添付容量またはファイル数の上限に達しました。" },
        409,
      );
    }

    const saved = await db
      .select()
      .from(memoAttachmentsTable)
      .where(
        and(
          eq(memoAttachmentsTable.r2Key, r2Key),
          eq(memoAttachmentsTable.userId, user.id),
        ),
      )
      .get();
    const latestQuota = await getAttachmentQuota(db, user.id);
    return c.json({ attachment: saved, quota: latestQuota });
  })
  .post("/delete/:id", async (c) => {
    const user = c.get("user");
    if (!user) return c.redirect("/login");
    const memoId = c.req.param("id");
    const db = getAppDb(c.env);

    const memo = await db
      .select()
      .from(memosTable)
      .where(and(eq(memosTable.userId, user.id), eq(memosTable.id, memoId)))
      .get();

    if (memo) {
      const deleted = await enqueueMemoDeletion(
        c.env.MY_MEMO_D1,
        memoId,
        user.id,
      );
      if (deleted) {
        const createDeletionTask = () => processR2DeletionJobs(c.env);
        const scheduled = scheduleBackgroundTask(
          () => c.executionCtx,
          createDeletionTask,
        );
        if (!scheduled) await createDeletionTask();
      }
    }

    return c.redirect("/");
  })
  .post("/:id/tags", zValidator("json", tagUpdateSchema), async (c) => {
    const user = c.get("user");
    if (!user) return c.json({ message: "認証が必要です。" }, 401);

    const memoId = c.req.param("id");
    const db = getAppDb(c.env);
    const memo = await db
      .select({ id: memosTable.id })
      .from(memosTable)
      .where(and(eq(memosTable.id, memoId), eq(memosTable.userId, user.id)))
      .get();
    if (!memo) return c.json({ message: "メモが見つかりません。" }, 404);

    const validated = c.req.valid("json");
    const normalized = normalizeTagNames(validated.tags);
    if (!normalized.ok) return c.json({ message: normalized.message }, 400);

    await replaceMemoTags(c.env.MY_MEMO_D1, memoId, user.id, normalized.names);
    const tags = await db
      .select({ id: tagsTable.id, name: tagsTable.name })
      .from(tagsTable)
      .innerJoin(memoTagsTable, eq(memoTagsTable.tagId, tagsTable.id))
      .where(
        and(eq(memoTagsTable.memoId, memoId), eq(tagsTable.userId, user.id)),
      )
      .orderBy(asc(tagsTable.name));

    return c.json({ tags });
  })
  .post("/url", zValidator("form", memoSchema.url), async (c) => {
    const user = c.get("user");
    if (!user) return c.redirect("/login");
    if (!wantsStream(c)) {
      return jsonError(
        c,
        "SSE_REQUIRED",
        "URL要約にはSSEに対応したリクエストが必要です。",
        406,
      );
    }

    const validated = c.req.valid("form");
    const url = validated.url;

    return streamSSE(c, async (stream) => {
      const writeEvent: SummaryStreamEventWriter = (event, payload) =>
        stream.writeSSE({
          event,
          data: JSON.stringify(payload),
        });
      const writeError = (failure: UrlSummaryFailure) =>
        stream.writeSSE({
          event: "error",
          data: JSON.stringify(failure),
        });

      try {
        const db = getAppDb(c.env);
        const memoEntitlement = await getEntitlement(
          db,
          user.id,
          PLAN_METRICS.memoTotal,
        );
        const aiEntitlement = await getEntitlement(
          db,
          user.id,
          PLAN_METRICS.aiSummaryMonthly,
        );
        if (!memoEntitlement || !aiEntitlement) {
          await writeError({
            code: "PLAN_CONFIGURATION_ERROR",
            message: "プランの上限設定が不足しています。",
          });
          return;
        }

        const memoUsage = await getUsage(db, user.id, PLAN_METRICS.memoTotal);
        if (
          memoEntitlement.limit !== null &&
          memoUsage >= memoEntitlement.limit
        ) {
          await writeError({
            code: "QUOTA_EXCEEDED",
            message: `メモの上限（${memoEntitlement.limit}件）に達しています。`,
          });
          return;
        }

        const processUrlSummary = async (): Promise<UrlSummaryResult> => {
          const fetchedHtml = await fetchPublicHtml(url);
          const htmlText = decodeLinkPreviewHtml(
            fetchedHtml.bytes,
            fetchedHtml.headers,
          );

          // UTF-8のBlobとして再生成してAIに渡す
          const utf8Blob = new Blob([htmlText], {
            type: "text/html; charset=utf-8",
          });

          const reservationPeriodStart = currentUtcMonthStart();
          const reserved = await reserveAiSummaryQuota(
            c.env.MY_MEMO_D1,
            user.id,
            reservationPeriodStart,
          );
          if (!reserved) {
            return {
              ok: false,
              failure: {
                code: "QUOTA_EXCEEDED",
                message: `AI要約の今月の上限（${aiEntitlement.limit ?? "無制限"}回）に達しています。`,
              },
            };
          }
          let reservationConsumed = false;
          try {
            const [markdown] = await c.env.AI.toMarkdown([
              {
                name: url,
                blob: utf8Blob,
              },
            ]);

            if (markdown.format === "error") {
              return {
                ok: false,
                failure: {
                  code: "AI_SUMMARY_ERROR",
                  message: "ページを要約できませんでした。",
                },
              };
            }

            const m = markdown.data.match(
              /\s*title:\s*(?<title>.+?)\s*\n[\s\S]*?/m,
            );
            const title = m?.groups?.title;
            const messages = [
              {
                role: "user" as const,
                content:
                  "以下の内容を、日本語で100文字以下の概要と2~5個の箇条書きで、markdown形式にまとめてください。出力のボリュームは内容に応じて変えてください。出力形式は概要と箇条書きのみとすること。「概要」「要約」などのセクション項目名自体は含めないこと。\n\n" +
                  markdown.data,
              },
            ];

            await writeEvent("status", { message: "要約を生成しています…" });

            const summary = await readWorkersAiTextStream(
              await c.env.AI.run("@cf/openai/gpt-oss-20b", {
                messages,
                reasoning_effort: "low",
                max_completion_tokens: 1024,
                stream: true,
              }),
              async (text) => writeEvent("chunk", { text }),
            );

            if (!summary) {
              return {
                ok: false,
                failure: {
                  code: "AI_SUMMARY_ERROR",
                  message: "AI要約を作成できませんでした。",
                },
              };
            }

            await writeEvent("status", { message: "要約を保存しています…" });

            const inserted = await insertMemoWithinQuota(c.env.MY_MEMO_D1, {
              id: crypto.randomUUID(),
              title: decodeHtmlEntities(title || "No Title"),
              content: summary,
              userId: user.id,
              isAiSummary: 1,
              url,
              categoryId: validated.category ?? null,
              tags: validated.tags,
            });
            if (!inserted) {
              return {
                ok: false,
                failure: {
                  code: "QUOTA_EXCEEDED",
                  message:
                    "メモの上限に達したため、要約を保存できませんでした。",
                },
              };
            }

            scheduleBackgroundTask(
              () => c.executionCtx,
              () => refreshLinkPreviewCache(c.env.MY_MEMO_D1, url),
            );

            reservationConsumed = true;
            return { ok: true };
          } finally {
            if (!reservationConsumed) {
              await releaseAiSummaryQuota(
                c.env.MY_MEMO_D1,
                user.id,
                reservationPeriodStart,
              );
            }
          }
        };

        await writeEvent("status", { message: "ページを取得しています…" });
        const result = await processUrlSummary();
        if (!result.ok) {
          await writeError(result.failure);
          return;
        }

        await stream.writeSSE({
          event: "complete",
          data: JSON.stringify({ redirect: "/" }),
        });
      } catch {
        await writeError({
          code: "AI_SUMMARY_ERROR",
          message: "AI要約を作成できませんでした。",
        });
      }
    });
  });

export default memosRoute;
