import { and, eq } from "drizzle-orm";
import { getAppDb } from "@/features/access-control/authorization";
import { insertMemoAndAttachmentsWithinQuota } from "@/features/access-control/quota";
import {
  decodeAttachmentFileName,
  getAttachmentPreviewKind,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS_PER_MEMO,
  MAX_SHARED_ATTACHMENT_BYTES,
  parseMediaDimensions,
  SHARE_INTAKE_MAX_AGE_MS,
} from "@/features/attachments/model/attachment-constants";
import { isValidThumbnailFile } from "@/features/attachments/server/attachment-upload";
import { getAttachmentQuota } from "@/features/attachments/server/attachments";
import { putR2ObjectWithKnownLength } from "@/features/attachments/server/r2-upload";
import {
  releaseAttachmentReservation,
  reserveAttachmentUpload,
} from "@/features/attachments/server/upload-reservations";
import {
  createMediaSharePrefill,
  type MediaShareFile,
  type PendingShare,
  type SharedMemoPrefill,
} from "@/features/sharing/model/share";
import { shareIntakeFilesTable, shareIntakesTable } from "@/schema";

export const SHARE_STAGING_PREFIX = "share-staging";

export type ShareIntakeFile = {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  etag: string;
  r2Key: string;
  reservationId: string;
};

export type ShareIntake = {
  id: string;
  title: string;
  text: string;
  url: string | null;
  status: string;
  expiresAt: string;
  files: ShareIntakeFile[];
  prefill: SharedMemoPrefill;
};

export class ShareIntakeError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "ShareIntakeError";
  }
}

const isFile = (value: unknown): value is File => {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<File>;
  return (
    typeof candidate.name === "string" &&
    typeof candidate.size === "number" &&
    typeof candidate.type === "string" &&
    typeof candidate.stream === "function"
  );
};

export const getSharedFiles = (value: unknown): File[] => {
  const values = Array.isArray(value) ? value : [value];
  return values.filter(isFile);
};

const normalizeContentType = (value: string) =>
  value.split(";", 1)[0].trim().toLowerCase().slice(0, 255) ||
  "application/octet-stream";

const normalizedFile = (file: File): MediaShareFile & { file: File } => ({
  file,
  fileName: decodeAttachmentFileName(encodeURIComponent(file.name)),
  contentType: normalizeContentType(file.type),
  sizeBytes: file.size,
});

export const validateSharedFiles = async (
  files: ReadonlyArray<File>,
  userId: string,
  env: CloudflareBindings,
) => {
  if (files.length === 0) {
    throw new ShareIntakeError("共有ファイルが見つかりません。", 400);
  }
  if (files.length > MAX_ATTACHMENTS_PER_MEMO) {
    throw new ShareIntakeError(
      `共有できるファイルは${MAX_ATTACHMENTS_PER_MEMO}件までです。`,
      413,
    );
  }

  const normalized = files.map(normalizedFile);
  const tooLarge = normalized.find(
    (file) => file.sizeBytes > MAX_ATTACHMENT_BYTES,
  );
  if (tooLarge) {
    throw new ShareIntakeError(
      `「${tooLarge.fileName}」は1ファイル25 MiBを超えています。`,
      413,
    );
  }

  const totalBytes = normalized.reduce(
    (total, file) => total + file.sizeBytes,
    0,
  );
  if (totalBytes > MAX_SHARED_ATTACHMENT_BYTES) {
    throw new ShareIntakeError(
      "共有ファイルの合計が75 MiBを超えています。",
      413,
    );
  }

  const quota = await getAttachmentQuota(getAppDb(env), userId);
  if (!quota) {
    throw new ShareIntakeError("添付容量の上限設定がありません。", 500);
  }
  if (quota.remaining !== null && totalBytes > quota.remaining) {
    throw new ShareIntakeError("添付容量の残りが足りません。", 409);
  }

  return { files: normalized, totalBytes };
};

const getShareStagingKey = (shareId: string) =>
  `${SHARE_STAGING_PREFIX}/${shareId}/${crypto.randomUUID()}`;

const deleteKeys = async (bucket: R2Bucket, keys: readonly string[]) => {
  const results = await Promise.allSettled(
    keys.map((key) => bucket.delete(key)),
  );
  const failure = results.find(
    (result): result is PromiseRejectedResult => result.status === "rejected",
  );
  if (failure) throw failure.reason;
};

const deleteShareRows = async (env: CloudflareBindings, shareId: string) => {
  await getAppDb(env)
    .delete(shareIntakesTable)
    .where(eq(shareIntakesTable.id, shareId));
};

export const createShareIntake = async (
  env: CloudflareBindings,
  userId: string,
  pendingShare: PendingShare,
  files: ReadonlyArray<File>,
) => {
  const validated = await validateSharedFiles(files, userId, env);
  const shareId = crypto.randomUUID();
  const db = getAppDb(env);
  const expiresAt = new Date(
    Date.now() + SHARE_INTAKE_MAX_AGE_MS,
  ).toISOString();
  const normalized = validated.files;
  const prefill = createMediaSharePrefill(pendingShare, normalized);

  await db.insert(shareIntakesTable).values({
    id: shareId,
    userId,
    title: prefill.title,
    text: prefill.content,
    url: prefill.url ?? null,
    status: "pending",
    expiresAt,
  });

  const uploadedKeys: string[] = [];
  const reservationIds: string[] = [];
  try {
    for (const file of normalized) {
      const r2Key = getShareStagingKey(shareId);
      const reservation = await reserveAttachmentUpload(env.MY_MEMO_D1, {
        userId,
        shareIntakeId: shareId,
        r2Key,
        sizeBytes: file.sizeBytes,
      });
      if (!reservation) {
        throw new ShareIntakeError("添付容量の残りが足りません。", 409);
      }
      reservationIds.push(reservation.id);
      const object = await putR2ObjectWithKnownLength(
        env.MY_MEMO_FILES,
        r2Key,
        file.file.stream(),
        file.sizeBytes,
        { httpMetadata: { contentType: file.contentType } },
      );
      if (!object || object.size !== file.sizeBytes) {
        throw new ShareIntakeError(
          "共有ファイルのサイズを確認できませんでした。",
          400,
        );
      }
      uploadedKeys.push(r2Key);
      await db.insert(shareIntakeFilesTable).values({
        id: crypto.randomUUID(),
        shareIntakeId: shareId,
        userId,
        reservationId: reservation.id,
        r2Key,
        fileName: file.fileName,
        contentType: file.contentType,
        sizeBytes: object.size,
        etag: object.etag,
      });
    }
  } catch (error) {
    let cleanupError: unknown;
    try {
      await deleteKeys(env.MY_MEMO_FILES, uploadedKeys);
    } catch (cause) {
      cleanupError = cause;
    }
    await deleteShareRows(env, shareId);
    await Promise.all(
      reservationIds.map((id) =>
        releaseAttachmentReservation(env.MY_MEMO_D1, userId, id),
      ),
    );
    if (cleanupError) {
      console.error(
        JSON.stringify({
          event: "share_intake_staging_cleanup_failed",
          shareId,
          error:
            cleanupError instanceof Error
              ? cleanupError.message
              : String(cleanupError),
        }),
      );
    }
    if (error instanceof ShareIntakeError) throw error;
    throw new ShareIntakeError("共有ファイルを準備できませんでした。", 502);
  }

  return { id: shareId, expiresAt, prefill };
};

const mapShareIntake = (
  intake: typeof shareIntakesTable.$inferSelect,
  files: ReadonlyArray<typeof shareIntakeFilesTable.$inferSelect>,
): ShareIntake => ({
  id: intake.id,
  title: intake.title,
  text: intake.text,
  url: intake.url,
  status: intake.status,
  expiresAt: intake.expiresAt,
  files: files.map((file) => ({
    id: file.id,
    fileName: file.fileName,
    contentType: file.contentType,
    sizeBytes: file.sizeBytes,
    etag: file.etag,
    r2Key: file.r2Key,
    reservationId: file.reservationId,
  })),
  prefill: createMediaSharePrefill(
    { title: intake.title, text: intake.text, url: intake.url ?? "" },
    files,
  ),
});

export const getShareIntake = async (
  env: CloudflareBindings,
  userId: string,
  shareId: string,
) => {
  const db = getAppDb(env);
  const intake = await db
    .select()
    .from(shareIntakesTable)
    .where(
      and(
        eq(shareIntakesTable.id, shareId),
        eq(shareIntakesTable.userId, userId),
      ),
    )
    .get();
  if (!intake) return undefined;

  if (
    intake.status === "pending" &&
    Date.parse(intake.expiresAt) <= Date.now()
  ) {
    const files = await db
      .select({ r2Key: shareIntakeFilesTable.r2Key })
      .from(shareIntakeFilesTable)
      .where(eq(shareIntakeFilesTable.shareIntakeId, shareId));
    await deleteKeys(
      env.MY_MEMO_FILES,
      files.map((file) => file.r2Key),
    );
    const expiredFiles = await db
      .select({ reservationId: shareIntakeFilesTable.reservationId })
      .from(shareIntakeFilesTable)
      .where(eq(shareIntakeFilesTable.shareIntakeId, shareId));
    await Promise.all(
      expiredFiles.map((file) =>
        releaseAttachmentReservation(
          env.MY_MEMO_D1,
          userId,
          file.reservationId,
        ),
      ),
    );
    await deleteShareRows(env, shareId);
    return undefined;
  }

  const files = await db
    .select()
    .from(shareIntakeFilesTable)
    .where(eq(shareIntakeFilesTable.shareIntakeId, shareId));
  return mapShareIntake(intake, files);
};

export const removeShareIntakeFile = async (
  env: CloudflareBindings,
  userId: string,
  shareId: string,
  fileId: string,
) => {
  const intake = await getShareIntake(env, userId, shareId);
  if (intake?.status !== "pending") return undefined;
  const file = intake.files.find((candidate) => candidate.id === fileId);
  if (!file) return undefined;

  const claim = await env.MY_MEMO_D1.prepare(
    `UPDATE share_intakes
       SET status = 'removing', updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND user_id = ? AND status = 'pending'`,
  )
    .bind(shareId, userId)
    .run();
  if (claim.meta.changes !== 1) return undefined;

  try {
    await env.MY_MEMO_FILES.delete(file.r2Key);
    await releaseAttachmentReservation(
      env.MY_MEMO_D1,
      userId,
      file.reservationId,
    );
    const deleted = await env.MY_MEMO_D1.prepare(
      `DELETE FROM share_intake_files
       WHERE id = ? AND share_intake_id = ? AND user_id = ?`,
    )
      .bind(fileId, shareId, userId)
      .run();
    if (deleted.meta.changes !== 1) {
      throw new ShareIntakeError("共有ファイルを外せませんでした。", 500);
    }
    await env.MY_MEMO_D1.prepare(
      `UPDATE share_intakes
       SET status = 'pending', updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND user_id = ? AND status = 'removing'`,
    )
      .bind(shareId, userId)
      .run();
    return getShareIntake(env, userId, shareId);
  } catch (error) {
    try {
      await env.MY_MEMO_D1.prepare(
        `UPDATE share_intakes
         SET status = 'pending', updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND user_id = ? AND status = 'removing'`,
      )
        .bind(shareId, userId)
        .run();
    } catch (resetError) {
      console.error(
        JSON.stringify({
          event: "share_intake_reset_failed",
          shareId,
          error:
            resetError instanceof Error
              ? resetError.message
              : String(resetError),
        }),
      );
    }
    throw error;
  }
};

export const removeShareIntake = async (
  env: CloudflareBindings,
  userId: string,
  shareId: string,
) => {
  const intake = await getShareIntake(env, userId, shareId);
  if (!intake) return false;

  const claim = await env.MY_MEMO_D1.prepare(
    `UPDATE share_intakes
       SET status = 'cancelling', updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND user_id = ? AND status = 'pending'`,
  )
    .bind(shareId, userId)
    .run();
  if (claim.meta.changes !== 1) {
    throw new ShareIntakeError("この共有内容はすでに処理中です。", 409);
  }

  try {
    await deleteKeys(
      env.MY_MEMO_FILES,
      intake.files.map((file) => file.r2Key),
    );
    await Promise.all(
      intake.files.map((file) =>
        releaseAttachmentReservation(
          env.MY_MEMO_D1,
          userId,
          file.reservationId,
        ),
      ),
    );
    await env.MY_MEMO_D1.prepare(
      `DELETE FROM share_intakes
       WHERE id = ? AND user_id = ? AND status = 'cancelling'`,
    )
      .bind(shareId, userId)
      .run();
  } catch (error) {
    try {
      await env.MY_MEMO_D1.prepare(
        `UPDATE share_intakes
         SET status = 'pending', updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND user_id = ? AND status = 'cancelling'`,
      )
        .bind(shareId, userId)
        .run();
    } catch (resetError) {
      console.error(
        JSON.stringify({
          event: "share_intake_reset_failed",
          shareId,
          error:
            resetError instanceof Error
              ? resetError.message
              : String(resetError),
        }),
      );
    }
    throw error;
  }
  return true;
};

type FinalizeMemo = {
  title: string;
  content: string | null;
  url: string | null;
  categoryId: string | null;
  tags: readonly string[];
  mediaDimensions: readonly {
    fileId: string;
    width: number;
    height: number;
  }[];
  thumbnails: readonly { fileId: string; file: File }[];
};

export const finalizeShareIntake = async (
  env: CloudflareBindings,
  userId: string,
  shareId: string,
  memo: FinalizeMemo,
) => {
  const intake = await getShareIntake(env, userId, shareId);
  if (!intake)
    throw new ShareIntakeError("共有内容が見つからないか期限切れです。", 404);
  if (intake.status !== "pending") {
    throw new ShareIntakeError("この共有内容はすでに確定しています。", 409);
  }
  if (intake.files.length === 0) {
    throw new ShareIntakeError("保存する共有ファイルがありません。", 400);
  }
  const dimensionsByFileId = new Map(
    memo.mediaDimensions.map((dimensions) => [dimensions.fileId, dimensions]),
  );
  const thumbnailsByFileId = new Map(
    memo.thumbnails.map((thumbnail) => [thumbnail.fileId, thumbnail.file]),
  );
  if (thumbnailsByFileId.size !== memo.thumbnails.length) {
    throw new ShareIntakeError("共有画像のサムネイルが重複しています。", 400);
  }
  for (const file of intake.files) {
    const thumbnail = thumbnailsByFileId.get(file.id);
    if (getAttachmentPreviewKind(file.contentType) === "image") {
      if (!thumbnail || !(await isValidThumbnailFile(thumbnail))) {
        throw new ShareIntakeError("共有画像のサムネイルが不正です。", 400);
      }
    } else if (thumbnail) {
      throw new ShareIntakeError(
        "画像以外にはサムネイルを指定できません。",
        400,
      );
    }
  }
  if (dimensionsByFileId.size !== memo.mediaDimensions.length) {
    throw new ShareIntakeError("共有ファイルの寸法が重複しています。", 400);
  }
  if (
    memo.mediaDimensions.some(
      (dimensions) =>
        !intake.files.some((file) => file.id === dimensions.fileId),
    )
  ) {
    throw new ShareIntakeError("共有ファイルの寸法対象が不正です。", 400);
  }

  const claim = await env.MY_MEMO_D1.prepare(
    `UPDATE share_intakes
       SET status = 'finalizing', updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND user_id = ? AND status = 'pending' AND expires_at > ?`,
  )
    .bind(shareId, userId, new Date().toISOString())
    .run();
  if (claim.meta.changes !== 1) {
    throw new ShareIntakeError(
      "この共有内容はすでに処理中または確定しています。",
      409,
    );
  }

  const memoId = crypto.randomUUID();
  const finalKeys: string[] = [];
  const finalAttachments: Array<{
    id: string;
    r2Key: string;
    fileName: string;
    contentType: string;
    sizeBytes: number;
    mediaWidth: number | null;
    mediaHeight: number | null;
    etag: string;
    thumbnailR2Key: string | null;
    thumbnailContentType: string | null;
    thumbnailSizeBytes: number | null;
  }> = [];
  let committed = false;

  try {
    for (const staged of intake.files) {
      const source = await env.MY_MEMO_FILES.get(staged.r2Key);
      if (
        !source?.body ||
        source.size !== staged.sizeBytes ||
        source.etag !== staged.etag
      ) {
        throw new ShareIntakeError(
          "確定前の共有ファイルが見つかりません。",
          400,
        );
      }
      const dimensions = dimensionsByFileId.get(staged.id);
      let mediaDimensions: { width: number; height: number } | null;
      try {
        mediaDimensions = parseMediaDimensions(
          staged.contentType,
          dimensions ? String(dimensions.width) : null,
          dimensions ? String(dimensions.height) : null,
        );
      } catch (error) {
        throw new ShareIntakeError(
          error instanceof Error
            ? error.message
            : "共有ファイルの寸法が不正です。",
          400,
        );
      }
      const r2Key = `users/${userId}/memos/${memoId}/${crypto.randomUUID()}`;
      const thumbnail = thumbnailsByFileId.get(staged.id);
      const thumbnailR2Key = thumbnail ? `${r2Key}.thumbnail` : null;
      const object = await putR2ObjectWithKnownLength(
        env.MY_MEMO_FILES,
        r2Key,
        source.body,
        staged.sizeBytes,
        { httpMetadata: { contentType: staged.contentType } },
      );
      if (!object || object.size !== staged.sizeBytes) {
        throw new ShareIntakeError(
          "共有ファイルの保存サイズを確認できませんでした。",
          502,
        );
      }
      finalKeys.push(r2Key);
      let thumbnailObject: R2Object | null = null;
      if (thumbnail && thumbnailR2Key) {
        const linkedThumbnail = await env.MY_MEMO_D1.prepare(
          `UPDATE attachment_upload_reservations
           SET thumbnail_r2_key = ?
           WHERE id = ? AND user_id = ? AND share_intake_id = ?
             AND status = 'pending' AND expires_at > ?`,
        )
          .bind(
            thumbnailR2Key,
            staged.reservationId,
            userId,
            shareId,
            new Date().toISOString(),
          )
          .run();
        if (linkedThumbnail.meta.changes !== 1) {
          throw new ShareIntakeError(
            "共有画像のサムネイル予約を確認できませんでした。",
            409,
          );
        }
        thumbnailObject = await putR2ObjectWithKnownLength(
          env.MY_MEMO_FILES,
          thumbnailR2Key,
          thumbnail.stream(),
          thumbnail.size,
          { httpMetadata: { contentType: thumbnail.type } },
        );
        finalKeys.push(thumbnailR2Key);
      }
      finalAttachments.push({
        id: crypto.randomUUID(),
        r2Key,
        fileName: staged.fileName,
        contentType: staged.contentType,
        sizeBytes: object.size,
        mediaWidth: mediaDimensions?.width ?? null,
        mediaHeight: mediaDimensions?.height ?? null,
        etag: object.etag,
        thumbnailR2Key,
        thumbnailContentType: thumbnail?.type ?? null,
        thumbnailSizeBytes: thumbnailObject?.size ?? null,
      });
    }

    const finalized = await insertMemoAndAttachmentsWithinQuota(
      env.MY_MEMO_D1,
      {
        id: memoId,
        userId,
        title: memo.title,
        content: memo.content,
        url: memo.url,
        categoryId: memo.categoryId,
        isAiSummary: 0,
        tags: memo.tags,
      },
      finalAttachments.map((attachment) => ({ ...attachment, memoId, userId })),
      [
        ...intake.files.map((file) =>
          env.MY_MEMO_D1.prepare(
            `DELETE FROM attachment_upload_reservations
             WHERE id = ? AND user_id = ? AND share_intake_id = ?
               AND status = 'pending' AND expires_at > ?`,
          ).bind(file.reservationId, userId, shareId, new Date().toISOString()),
        ),
        env.MY_MEMO_D1.prepare(
          `UPDATE share_intakes
             SET status = 'finalized', updated_at = CURRENT_TIMESTAMP
             WHERE id = ? AND user_id = ? AND status = 'finalizing'
               AND EXISTS (
                 SELECT 1 FROM memos WHERE id = ? AND user_id = ?
               )
               AND (
                 SELECT COUNT(*)
                 FROM memo_attachments
                 WHERE memo_id = ? AND user_id = ?
               ) = ?`,
        ).bind(
          shareId,
          userId,
          memoId,
          userId,
          memoId,
          userId,
          finalAttachments.length,
        ),
        env.MY_MEMO_D1.prepare(
          `DELETE FROM share_intake_files
           WHERE share_intake_id = ? AND user_id = ?
             AND EXISTS (
               SELECT 1 FROM share_intakes
               WHERE id = ? AND user_id = ? AND status = 'finalized'
             )`,
        ).bind(shareId, userId, shareId, userId),
      ],
    );
    if (!finalized) {
      throw new ShareIntakeError("メモまたは添付の上限に達しました。", 409);
    }
    committed = true;
    try {
      await deleteKeys(
        env.MY_MEMO_FILES,
        intake.files.map((file) => file.r2Key),
      );
    } catch (cleanupError) {
      console.error(
        JSON.stringify({
          event: "share_intake_staging_cleanup_failed",
          shareId,
          error:
            cleanupError instanceof Error
              ? cleanupError.message
              : String(cleanupError),
        }),
      );
    }
    return { memoId };
  } catch (error) {
    if (!committed) {
      try {
        await deleteKeys(env.MY_MEMO_FILES, finalKeys);
      } catch (cleanupError) {
        console.error(
          JSON.stringify({
            event: "share_intake_final_cleanup_failed",
            shareId,
            error:
              cleanupError instanceof Error
                ? cleanupError.message
                : String(cleanupError),
          }),
        );
      }
      try {
        await env.MY_MEMO_D1.prepare(
          `UPDATE share_intakes
             SET status = 'pending', updated_at = CURRENT_TIMESTAMP
             WHERE id = ? AND user_id = ? AND status = 'finalizing'`,
        )
          .bind(shareId, userId)
          .run();
      } catch (resetError) {
        console.error(
          JSON.stringify({
            event: "share_intake_reset_failed",
            shareId,
            error:
              resetError instanceof Error
                ? resetError.message
                : String(resetError),
          }),
        );
      }
    }
    if (error instanceof ShareIntakeError) throw error;
    throw new ShareIntakeError("共有メモを保存できませんでした。", 500);
  }
};
