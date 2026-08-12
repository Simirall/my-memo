const DELETION_BATCH_SIZE = 25;
const MAX_ATTEMPTS = 8;
const INITIAL_RETRY_DELAY_MS = 15 * 60 * 1000;
const MAX_RETRY_DELAY_MS = 24 * 60 * 60 * 1000;
const LEASE_MS = 5 * 60 * 1000;

type DeletionJob = {
  id: string;
  object_key: string;
  attempt_count: number;
};

type R2DeletionEnvironment = Pick<
  CloudflareBindings,
  "MY_MEMO_D1" | "MY_MEMO_FILES"
>;

const retryAt = (now: Date, attemptCount: number) =>
  new Date(
    now.getTime() +
      Math.min(
        INITIAL_RETRY_DELAY_MS * 2 ** Math.max(attemptCount - 1, 0),
        MAX_RETRY_DELAY_MS,
      ),
  ).toISOString();

export const enqueueAttachmentDeletion = async (
  database: D1Database,
  attachmentId: string,
  ownerUserId: string,
) => {
  const results = await database.batch([
    database
      .prepare(
        `INSERT OR IGNORE INTO r2_deletion_jobs
           (id, owner_user_id, object_key)
         SELECT lower(hex(randomblob(16))), user_id, r2_key
         FROM memo_attachments
         WHERE id = ? AND user_id = ?`,
      )
      .bind(attachmentId, ownerUserId),
    database
      .prepare(
        `INSERT OR IGNORE INTO r2_deletion_jobs
           (id, owner_user_id, object_key)
         SELECT lower(hex(randomblob(16))), user_id, thumbnail_r2_key
         FROM memo_attachments
         WHERE id = ? AND user_id = ? AND thumbnail_r2_key IS NOT NULL`,
      )
      .bind(attachmentId, ownerUserId),
    database
      .prepare("DELETE FROM memo_attachments WHERE id = ? AND user_id = ?")
      .bind(attachmentId, ownerUserId),
  ]);
  return Number(results[2]?.meta.changes ?? 0) > 0;
};

export const enqueueMemoDeletion = async (
  database: D1Database,
  memoId: string,
  ownerUserId: string,
) => {
  const results = await database.batch([
    database
      .prepare(
        `INSERT OR IGNORE INTO r2_deletion_jobs
           (id, owner_user_id, object_key)
         SELECT lower(hex(randomblob(16))), user_id, r2_key
         FROM memo_attachments
         WHERE memo_id = ? AND user_id = ?`,
      )
      .bind(memoId, ownerUserId),
    database
      .prepare(
        `INSERT OR IGNORE INTO r2_deletion_jobs
           (id, owner_user_id, object_key)
         SELECT lower(hex(randomblob(16))), user_id, thumbnail_r2_key
         FROM memo_attachments
         WHERE memo_id = ? AND user_id = ? AND thumbnail_r2_key IS NOT NULL`,
      )
      .bind(memoId, ownerUserId),
    database
      .prepare("DELETE FROM memos WHERE id = ? AND user_id = ?")
      .bind(memoId, ownerUserId),
  ]);
  // D1 includes rows removed by ON DELETE CASCADE in meta.changes.
  return Number(results[2]?.meta.changes ?? 0) > 0;
};

export const processR2DeletionJobs = async (
  env: R2DeletionEnvironment,
  options: {
    now?: Date;
    deleteObject?: (objectKey: string) => Promise<void>;
  } = {},
) => {
  const now = options.now ?? new Date();
  const nowIso = now.toISOString();
  const jobs = await env.MY_MEMO_D1.prepare(
    `SELECT id, object_key, attempt_count
     FROM r2_deletion_jobs
     WHERE status IN ('pending', 'processing')
       AND next_attempt_at <= ?
       AND (lease_until IS NULL OR lease_until <= ?)
     ORDER BY next_attempt_at, created_at
     LIMIT ?`,
  )
    .bind(nowIso, nowIso, DELETION_BATCH_SIZE)
    .all<DeletionJob>();
  const deleteObject =
    options.deleteObject ??
    ((objectKey) => env.MY_MEMO_FILES.delete(objectKey));
  let deleted = 0;
  let failed = 0;

  for (const job of jobs.results) {
    const leaseUntil = new Date(now.getTime() + LEASE_MS).toISOString();
    const claimed = await env.MY_MEMO_D1.prepare(
      `UPDATE r2_deletion_jobs
       SET status = 'processing', lease_until = ?, updated_at = ?
       WHERE id = ?
         AND status IN ('pending', 'processing')
         AND next_attempt_at <= ?
         AND (lease_until IS NULL OR lease_until <= ?)`,
    )
      .bind(leaseUntil, nowIso, job.id, nowIso, nowIso)
      .run();
    if (Number(claimed.meta.changes ?? 0) !== 1) continue;

    try {
      await deleteObject(job.object_key);
      await env.MY_MEMO_D1.prepare(
        "DELETE FROM r2_deletion_jobs WHERE id = ? AND lease_until = ?",
      )
        .bind(job.id, leaseUntil)
        .run();
      deleted += 1;
    } catch (error) {
      const attemptCount = job.attempt_count + 1;
      const exhausted = attemptCount >= MAX_ATTEMPTS;
      await env.MY_MEMO_D1.prepare(
        `UPDATE r2_deletion_jobs
         SET status = ?, attempt_count = ?, next_attempt_at = ?,
             lease_until = NULL, last_failure = ?, updated_at = ?
         WHERE id = ? AND lease_until = ?`,
      )
        .bind(
          exhausted ? "failed" : "pending",
          attemptCount,
          exhausted ? nowIso : retryAt(now, attemptCount),
          error instanceof Error ? error.name : "UnknownError",
          nowIso,
          job.id,
          leaseUntil,
        )
        .run();
      console.error(
        JSON.stringify({
          event: "r2_deletion_job_failed",
          jobId: job.id,
          attemptCount,
          exhausted,
          errorType: error instanceof Error ? error.name : "UnknownError",
        }),
      );
      failed += 1;
    }
  }

  return { deleted, failed };
};
