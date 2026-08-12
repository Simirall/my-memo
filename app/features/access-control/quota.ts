import {
  currentUtcMonthStart,
  PLAN_METRICS,
} from "@/features/access-control/authorization";
import { MAX_ATTACHMENTS_PER_MEMO } from "@/features/attachments/model/attachment-constants";

export type MemoAttachmentInsert = {
  id: string;
  memoId: string;
  userId: string;
  r2Key: string;
  thumbnailR2Key?: string | null;
  thumbnailContentType?: string | null;
  thumbnailSizeBytes?: number | null;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  mediaWidth?: number | null;
  mediaHeight?: number | null;
  etag: string;
};

type MemoInsert = {
  id: string;
  userId: string;
  title: string;
  content: string | null;
  url: string | null;
  categoryId: string | null;
  isAiSummary: 0 | 1;
  tags?: readonly string[];
};

const buildMemoStatements = (
  db: D1Database,
  memo: MemoInsert,
  attachmentCount = 0,
  _attachmentBytes = 0,
) => {
  const attachmentQuotaCondition =
    attachmentCount > 0
      ? `
             AND EXISTS (
               SELECT 1
               FROM user AS attachment_user
               INNER JOIN plan_limits AS attachment_limits
                 ON attachment_limits.plan_id = attachment_user.plan_id
                AND attachment_limits.metric = 'attachment.storage_bytes'
               WHERE attachment_user.id = ?
                 AND ? <= ${MAX_ATTACHMENTS_PER_MEMO}
                 AND (
                   attachment_limits.limit_value IS NULL
                   OR (
                     SELECT COALESCE(SUM(size_bytes), 0)
                     FROM memo_attachments
                     WHERE user_id = ?
                   ) + (
                     SELECT COALESCE(SUM(size_bytes), 0)
                     FROM attachment_upload_reservations
                     WHERE user_id = ? AND status = 'pending' AND expires_at > ?
                   ) <= attachment_limits.limit_value
                 )
             )`
      : "";

  const statements = [
    db
      .prepare(
        `INSERT INTO memos
          (id, user_id, title, content, url, category_id, is_ai_summary)
         SELECT ?, ?, ?, ?, ?, ?, ?
         WHERE EXISTS (
           SELECT 1
           FROM user AS u
           INNER JOIN plan_limits AS pl ON pl.plan_id = u.plan_id
           WHERE u.id = ?
             AND pl.metric = 'memo.total'
             AND (
               pl.limit_value IS NULL
               OR (SELECT COUNT(*) FROM memos WHERE user_id = ?) < pl.limit_value
             )
         )${attachmentQuotaCondition}`,
      )
      .bind(
        memo.id,
        memo.userId,
        memo.title,
        memo.content,
        memo.url,
        memo.categoryId,
        memo.isAiSummary,
        memo.userId,
        memo.userId,
        ...(attachmentCount > 0
          ? [
              memo.userId,
              attachmentCount,
              memo.userId,
              memo.userId,
              new Date().toISOString(),
            ]
          : []),
      ),
  ];

  for (const name of memo.tags ?? []) {
    statements.push(
      db
        .prepare(
          `INSERT INTO tags (id, user_id, name)
           SELECT ?, ?, ?
           WHERE EXISTS (SELECT 1 FROM memos WHERE id = ? AND user_id = ?)
           ON CONFLICT(user_id, name) DO NOTHING`,
        )
        .bind(crypto.randomUUID(), memo.userId, name, memo.id, memo.userId),
    );
  }

  for (const name of memo.tags ?? []) {
    statements.push(
      db
        .prepare(
          `INSERT INTO memo_tags (memo_id, tag_id)
           SELECT ?, id
           FROM tags
           WHERE user_id = ? AND name = ?
             AND EXISTS (SELECT 1 FROM memos WHERE id = ? AND user_id = ?)`,
        )
        .bind(memo.id, memo.userId, name, memo.id, memo.userId),
    );
  }

  return statements;
};

const buildAttachmentStatement = (
  db: D1Database,
  attachment: MemoAttachmentInsert,
) =>
  db
    .prepare(
      `INSERT INTO memo_attachments
        (id, memo_id, user_id, r2_key, thumbnail_r2_key, thumbnail_content_type, thumbnail_size_bytes, file_name, content_type, size_bytes, media_width, media_height, etag)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
       WHERE EXISTS (
         SELECT 1 FROM memos WHERE id = ? AND user_id = ?
       )`,
    )
    .bind(
      attachment.id,
      attachment.memoId,
      attachment.userId,
      attachment.r2Key,
      attachment.thumbnailR2Key ?? null,
      attachment.thumbnailContentType ?? null,
      attachment.thumbnailSizeBytes ?? null,
      attachment.fileName,
      attachment.contentType,
      attachment.sizeBytes,
      attachment.mediaWidth ?? null,
      attachment.mediaHeight ?? null,
      attachment.etag,
      attachment.memoId,
      attachment.userId,
    );

export async function insertMemoWithinQuota(
  db: D1Database,
  memo: MemoInsert,
): Promise<boolean> {
  const results = await db.batch(buildMemoStatements(db, memo));
  return results[0]?.meta.changes === 1;
}

export async function insertMemoAndAttachmentsWithinQuota(
  db: D1Database,
  memo: MemoInsert,
  attachments: ReadonlyArray<MemoAttachmentInsert>,
  trailingStatements: ReadonlyArray<D1PreparedStatement> = [],
): Promise<boolean> {
  const memoStatements = buildMemoStatements(
    db,
    memo,
    attachments.length,
    attachments.reduce((total, attachment) => total + attachment.sizeBytes, 0),
  );
  const statements = [
    ...memoStatements,
    ...attachments.map((attachment) =>
      buildAttachmentStatement(db, attachment),
    ),
    ...trailingStatements,
  ];
  const results = await db.batch(statements);
  const attachmentStart = memoStatements.length;
  return (
    results[0]?.meta.changes === 1 &&
    attachments.every(
      (_, index) => results[attachmentStart + index]?.meta.changes === 1,
    ) &&
    trailingStatements.every(
      (_, index) =>
        results[attachmentStart + attachments.length + index]?.meta.changes ===
        1,
    )
  );
}

export async function reserveAiSummaryQuota(
  db: D1Database,
  userId: string,
  periodStart = currentUtcMonthStart(),
): Promise<boolean> {
  const metric = PLAN_METRICS.aiSummaryMonthly;
  const result = await db
    .prepare(
      `INSERT INTO usage_counters (user_id, metric, period_start, used)
       SELECT ?, ?, ?, 1
       WHERE EXISTS (
         SELECT 1
         FROM user AS u
         INNER JOIN plan_limits AS pl ON pl.plan_id = u.plan_id
         WHERE u.id = ?
           AND pl.metric = ?
           AND (pl.limit_value IS NULL OR 1 <= pl.limit_value)
       )
       ON CONFLICT(user_id, metric, period_start) DO UPDATE SET
         used = usage_counters.used + 1,
         updated_at = CURRENT_TIMESTAMP
       WHERE EXISTS (
         SELECT 1
         FROM user AS u
         INNER JOIN plan_limits AS pl ON pl.plan_id = u.plan_id
         WHERE u.id = ?
           AND pl.metric = ?
           AND (pl.limit_value IS NULL OR usage_counters.used < pl.limit_value)
       )`,
    )
    .bind(userId, metric, periodStart, userId, metric, userId, metric)
    .run();

  return result.meta.changes === 1;
}

export async function releaseAiSummaryQuota(
  db: D1Database,
  userId: string,
  periodStart: string,
): Promise<void> {
  await db
    .prepare(
      `UPDATE usage_counters
       SET used = used - 1,
           updated_at = CURRENT_TIMESTAMP
       WHERE user_id = ?
         AND metric = ?
         AND period_start = ?
         AND used > 0`,
    )
    .bind(userId, PLAN_METRICS.aiSummaryMonthly, periodStart)
    .run();
}

export async function insertAttachmentWithinQuota(
  db: D1Database,
  attachment: MemoAttachmentInsert,
): Promise<boolean> {
  const result = await db
    .prepare(
      `INSERT INTO memo_attachments
        (id, memo_id, user_id, r2_key, thumbnail_r2_key, thumbnail_content_type, thumbnail_size_bytes, file_name, content_type, size_bytes, media_width, media_height, etag)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
       WHERE EXISTS (
         SELECT 1
         FROM memos AS m
         INNER JOIN user AS u ON u.id = m.user_id
         INNER JOIN plan_limits AS pl ON pl.plan_id = u.plan_id
         WHERE m.id = ?
           AND m.user_id = ?
           AND pl.metric = ?
           AND (SELECT COUNT(*) FROM memo_attachments WHERE memo_id = ?) < ?
           AND (
             pl.limit_value IS NULL
             OR (SELECT COALESCE(SUM(size_bytes), 0) FROM memo_attachments WHERE user_id = ?) + ? <= pl.limit_value
           )
       )`,
    )
    .bind(
      attachment.id,
      attachment.memoId,
      attachment.userId,
      attachment.r2Key,
      attachment.thumbnailR2Key ?? null,
      attachment.thumbnailContentType ?? null,
      attachment.thumbnailSizeBytes ?? null,
      attachment.fileName,
      attachment.contentType,
      attachment.sizeBytes,
      attachment.mediaWidth ?? null,
      attachment.mediaHeight ?? null,
      attachment.etag,
      attachment.memoId,
      attachment.userId,
      PLAN_METRICS.attachmentStorageBytes,
      attachment.memoId,
      MAX_ATTACHMENTS_PER_MEMO,
      attachment.userId,
      attachment.sizeBytes,
    )
    .run();

  return result.meta.changes === 1;
}

export async function insertReservedAttachment(
  db: D1Database,
  attachment: MemoAttachmentInsert,
  reservationId: string,
): Promise<boolean> {
  const results = await db.batch([
    db
      .prepare(
        `INSERT INTO memo_attachments
          (id, memo_id, user_id, r2_key, thumbnail_r2_key, thumbnail_content_type, thumbnail_size_bytes, file_name, content_type, size_bytes, media_width, media_height, etag)
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
         FROM attachment_upload_reservations AS r
         WHERE r.id = ?
           AND r.user_id = ?
           AND r.memo_id = ?
           AND r.r2_key = ?
           AND COALESCE(r.thumbnail_r2_key, '') = COALESCE(?, '')
           AND r.size_bytes = ?
           AND r.status = 'pending'
           AND r.expires_at > ?`,
      )
      .bind(
        attachment.id,
        attachment.memoId,
        attachment.userId,
        attachment.r2Key,
        attachment.thumbnailR2Key ?? null,
        attachment.thumbnailContentType ?? null,
        attachment.thumbnailSizeBytes ?? null,
        attachment.fileName,
        attachment.contentType,
        attachment.sizeBytes,
        attachment.mediaWidth ?? null,
        attachment.mediaHeight ?? null,
        attachment.etag,
        reservationId,
        attachment.userId,
        attachment.memoId,
        attachment.r2Key,
        attachment.thumbnailR2Key ?? null,
        attachment.sizeBytes,
        new Date().toISOString(),
      ),
    db
      .prepare(
        `DELETE FROM attachment_upload_reservations
         WHERE id = ? AND user_id = ?
           AND EXISTS (SELECT 1 FROM memo_attachments WHERE r2_key = ?)`,
      )
      .bind(reservationId, attachment.userId, attachment.r2Key),
  ]);
  return results[0]?.meta.changes === 1 && results[1]?.meta.changes === 1;
}
