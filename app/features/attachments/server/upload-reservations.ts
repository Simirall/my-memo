import { MAX_ATTACHMENTS_PER_MEMO } from "@/features/attachments/model/attachment-constants";

const ATTACHMENT_RESERVATION_MAX_AGE_MS = 30 * 60 * 1000;

export type AttachmentUploadReservation = {
  id: string;
  r2Key: string;
  thumbnailR2Key: string | null;
  expiresAt: string;
};

export async function reserveAttachmentUpload(
  db: D1Database,
  input: {
    userId: string;
    memoId?: string | null;
    shareIntakeId?: string | null;
    r2Key: string;
    thumbnailR2Key?: string | null;
    sizeBytes: number;
  },
): Promise<AttachmentUploadReservation | null> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const expiresAt = new Date(
    Date.now() + ATTACHMENT_RESERVATION_MAX_AGE_MS,
  ).toISOString();
  const result = await db
    .prepare(
      `INSERT INTO attachment_upload_reservations
        (id, user_id, memo_id, share_intake_id, r2_key, thumbnail_r2_key, size_bytes, status, expires_at)
       SELECT ?, ?, ?, ?, ?, ?, ?, 'pending', ?
       WHERE ? > 0
         AND EXISTS (
           SELECT 1
           FROM user AS u
           INNER JOIN plan_limits AS pl
             ON pl.plan_id = u.plan_id
            AND pl.metric = 'attachment.storage_bytes'
           WHERE u.id = ?
             AND (
               pl.limit_value IS NULL
               OR (
                 SELECT COALESCE(SUM(size_bytes), 0)
                 FROM memo_attachments
                 WHERE user_id = ?
               ) + (
                 SELECT COALESCE(SUM(size_bytes), 0)
                 FROM attachment_upload_reservations
                 WHERE user_id = ? AND status = 'pending' AND expires_at > ?
               ) + ? <= pl.limit_value
             )
         )
         AND (
           ? IS NULL
           OR (
             SELECT COUNT(*) FROM memo_attachments WHERE memo_id = ? AND user_id = ?
           ) + (
             SELECT COUNT(*)
             FROM attachment_upload_reservations
             WHERE memo_id = ? AND user_id = ? AND status = 'pending' AND expires_at > ?
           ) < ?
         )`,
    )
    .bind(
      id,
      input.userId,
      input.memoId ?? null,
      input.shareIntakeId ?? null,
      input.r2Key,
      input.thumbnailR2Key ?? null,
      input.sizeBytes,
      expiresAt,
      input.sizeBytes,
      input.userId,
      input.userId,
      input.userId,
      now,
      input.sizeBytes,
      input.memoId ?? null,
      input.memoId ?? null,
      input.userId,
      input.memoId ?? null,
      input.userId,
      now,
      MAX_ATTACHMENTS_PER_MEMO,
    )
    .run();
  return result.meta.changes === 1
    ? {
        id,
        r2Key: input.r2Key,
        thumbnailR2Key: input.thumbnailR2Key ?? null,
        expiresAt,
      }
    : null;
}

export async function releaseAttachmentReservation(
  db: D1Database,
  userId: string,
  reservationId: string,
): Promise<void> {
  await db
    .prepare(
      "DELETE FROM attachment_upload_reservations WHERE id = ? AND user_id = ?",
    )
    .bind(reservationId, userId)
    .run();
}

export async function releaseReservationsByKeys(
  db: D1Database,
  userId: string,
  keys: readonly string[],
): Promise<void> {
  for (const key of keys) {
    await db
      .prepare(
        `DELETE FROM attachment_upload_reservations
         WHERE user_id = ? AND (r2_key = ? OR thumbnail_r2_key = ?)`,
      )
      .bind(userId, key, key)
      .run();
  }
}
