import { currentUtcMonthStart, PLAN_METRICS } from "./authorization";

type MemoInsert = {
  id: string;
  userId: string;
  title: string;
  content: string;
  url: string | null;
  categoryId: string | null;
  aiGenerated: 0 | 1;
};

export async function insertMemoWithinQuota(
  db: D1Database,
  memo: MemoInsert,
): Promise<boolean> {
  const result = await db
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
    )
    .run();

  return result.meta.changes === 1;
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
