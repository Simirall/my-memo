import { and, eq } from "drizzle-orm";
import { shareIntakeFilesTable, shareIntakesTable } from "@/schema";
import {
  decodeAttachmentFileName,
  getAttachmentQuota,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS_PER_MEMO,
  MAX_SHARED_ATTACHMENT_BYTES,
  SHARE_INTAKE_MAX_AGE_MS,
} from "@/utils/attachments";
import { getAppDb } from "@/utils/authorization";
import { insertMemoAndAttachmentsWithinQuota } from "@/utils/quota";
import { putR2ObjectWithKnownLength } from "@/utils/r2-upload";
import {
  createMediaSharePrefill,
  type MediaShareFile,
  type PendingShare,
  type SharedMemoPrefill,
} from "./share";

export const SHARE_STAGING_PREFIX = "share-staging";

export type ShareIntakeFile = {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  etag: string;
  r2Key: string;
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
  try {
    for (const file of normalized) {
      const r2Key = getShareStagingKey(shareId);
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
  content: string;
  url: string | null;
  categoryId: string | null;
  tags: readonly string[];
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
    etag: string;
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
      const r2Key = `users/${userId}/memos/${memoId}/${crypto.randomUUID()}`;
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
      finalAttachments.push({
        id: crypto.randomUUID(),
        r2Key,
        fileName: staged.fileName,
        contentType: staged.contentType,
        sizeBytes: object.size,
        etag: object.etag,
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
