import { MAX_ATTACHMENTS_PER_MEMO } from "./attachment-constants";
import { currentUtcMonthStart, PLAN_METRICS } from "./authorization";

type MemoAttachmentInsert = {
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

export async function insertMemoWithinQuota(
  db: D1Database,
  memo: MemoInsert,
): Promise<boolean> {
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
         )`,
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

  const results = await db.batch(statements);
  return results[0]?.meta.changes === 1;
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
