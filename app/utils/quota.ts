import { MAX_ATTACHMENTS_PER_MEMO } from "./attachment-constants";
import { currentUtcMonthStart, PLAN_METRICS } from "./authorization";

export type MemoAttachmentInsert = {
  id: string;
  memoId: string;
  userId: string;
  r2Key: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  etag: string;
};

type MemoInsert = {
  id: string;
  userId: string;
  title: string;
  content: string;
  url: string | null;
  categoryId: string | null;
  aiGenerated: 0 | 1;
  tags?: readonly string[];
};

const buildMemoStatements = (
  db: D1Database,
  memo: MemoInsert,
  attachmentCount = 0,
  attachmentBytes = 0,
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
                   ) + ? <= attachment_limits.limit_value
                 )
             )`
      : "";

  const statements = [
    db
      .prepare(
        `INSERT INTO memos
          (id, user_id, title, content, url, category_id, ai_generated)
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
        memo.aiGenerated,
        memo.userId,
        memo.userId,
        ...(attachmentCount > 0
          ? [memo.userId, attachmentCount, memo.userId, attachmentBytes]
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
        (id, memo_id, user_id, r2_key, file_name, content_type, size_bytes, etag)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?
       WHERE EXISTS (
         SELECT 1 FROM memos WHERE id = ? AND user_id = ?
       )`,
    )
    .bind(
      attachment.id,
      attachment.memoId,
      attachment.userId,
      attachment.r2Key,
      attachment.fileName,
      attachment.contentType,
      attachment.sizeBytes,
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
    (trailingStatements.length === 0 ||
      results[attachmentStart + attachments.length]?.meta.changes === 1)
  );
}

export async function reserveAiSummaryQuota(
  db: D1Database,
  userId: string,
): Promise<boolean> {
  const periodStart = currentUtcMonthStart();
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

export async function insertAttachmentWithinQuota(
  db: D1Database,
  attachment: MemoAttachmentInsert,
): Promise<boolean> {
  const result = await db
    .prepare(
      `INSERT INTO memo_attachments
        (id, memo_id, user_id, r2_key, file_name, content_type, size_bytes, etag)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?
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
      attachment.fileName,
      attachment.contentType,
      attachment.sizeBytes,
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
