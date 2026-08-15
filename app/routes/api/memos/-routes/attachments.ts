import { and, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { getAppDb } from "@/features/access-control/authorization";
import { insertReservedAttachment } from "@/features/access-control/quota";
import {
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS_PER_MEMO,
} from "@/features/attachments/model/attachment-constants";
import { parseAttachmentUploadForm } from "@/features/attachments/server/attachment-upload";
import { getAttachmentQuota } from "@/features/attachments/server/attachments";
import { putR2ObjectWithKnownLength } from "@/features/attachments/server/r2-upload";
import {
  releaseAttachmentReservation,
  releaseReservationsByKeys,
  reserveAttachmentUpload,
} from "@/features/attachments/server/upload-reservations";
import { memoAttachmentsTable, memosTable } from "@/schema";
import {
  cleanupR2Keys,
  getEditAttachmentPrefix,
  isEditAttachmentToken,
} from "../-lib/attachments";

const attachmentsRoute = new Hono<{ Bindings: CloudflareBindings }>();

attachmentsRoute.post("/:id/edit-attachments", async (c) => {
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
      return c.json({ message: "ファイルサイズを確認できませんでした。" }, 400);
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
    return c.json({ message: "ファイルをアップロードできませんでした。" }, 502);
  }
});

attachmentsRoute.post("/:id/edit-attachments/cleanup", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ message: "認証が必要です。" }, 401);
  const memoId = c.req.param("id");
  const body = (await c.req.json().catch(() => null)) as {
    tokens?: unknown;
  } | null;
  const tokens = Array.isArray(body?.tokens)
    ? body.tokens.filter((token): token is string => typeof token === "string")
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
});

attachmentsRoute.post("/:id/attachments", async (c) => {
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
    return c.json({ message: "1メモに添付できるファイルは5件までです。" }, 409);
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
    return c.json({ message: "ファイルをアップロードできませんでした。" }, 502);
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
});

export default attachmentsRoute;
