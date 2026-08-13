const RECEIPT_ALGORITHM = "SHA-256";

type AccountDeletionEnvironment = Pick<
  CloudflareBindings,
  "MY_MEMO_D1" | "MY_MEMO_FILES"
>;

export type AccountDeletionStatus = "processing" | "failed" | "complete";

export const hashDeletionReceipt = async (receipt: string) => {
  const digest = await crypto.subtle.digest(
    RECEIPT_ALGORITHM,
    new TextEncoder().encode(receipt),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
};

const deletionJobStatements = (database: D1Database, userId: string) => [
  database
    .prepare(
      `INSERT OR IGNORE INTO r2_deletion_jobs (id, owner_user_id, object_key)
       SELECT lower(hex(randomblob(16))), user_id, r2_key
       FROM memo_attachments WHERE user_id = ?`,
    )
    .bind(userId),
  database
    .prepare(
      `INSERT OR IGNORE INTO r2_deletion_jobs (id, owner_user_id, object_key)
       SELECT lower(hex(randomblob(16))), user_id, thumbnail_r2_key
       FROM memo_attachments
       WHERE user_id = ? AND thumbnail_r2_key IS NOT NULL`,
    )
    .bind(userId),
  database
    .prepare(
      `INSERT OR IGNORE INTO r2_deletion_jobs (id, owner_user_id, object_key)
       SELECT lower(hex(randomblob(16))), user_id, r2_key
       FROM share_intake_files WHERE user_id = ?`,
    )
    .bind(userId),
  database
    .prepare(
      `INSERT OR IGNORE INTO r2_deletion_jobs (id, owner_user_id, object_key)
       SELECT lower(hex(randomblob(16))), user_id, r2_key
       FROM attachment_upload_reservations WHERE user_id = ?`,
    )
    .bind(userId),
  database
    .prepare(
      `INSERT OR IGNORE INTO r2_deletion_jobs (id, owner_user_id, object_key)
       SELECT lower(hex(randomblob(16))), user_id, thumbnail_r2_key
       FROM attachment_upload_reservations
       WHERE user_id = ? AND thumbnail_r2_key IS NOT NULL`,
    )
    .bind(userId),
];

export const startAccountDeletion = async (
  database: D1Database,
  userId: string,
  receiptHash: string,
) => {
  const requestId = crypto.randomUUID();
  await database.batch([
    database
      .prepare(
        `INSERT OR IGNORE INTO account_deletion_requests
           (id, user_id, receipt_hash, status)
         VALUES (?, ?, ?, 'processing')`,
      )
      .bind(requestId, userId, receiptHash),
    ...deletionJobStatements(database, userId),
  ]);
  const stored = await database
    .prepare(
      `SELECT receipt_hash, status
       FROM account_deletion_requests WHERE user_id = ?`,
    )
    .bind(userId)
    .first<{
      receipt_hash: string;
      status: "processing" | "failed";
    }>();
  if (!stored) throw new Error("Account deletion request was not created.");
  return {
    created: stored.receipt_hash === receiptHash,
    status: stored.status,
  };
};

export const getAccountDeletionStatus = async (
  database: D1Database,
  receiptHash: string,
) => {
  const request = await database
    .prepare(
      `SELECT status, last_failure
       FROM account_deletion_requests WHERE receipt_hash = ?`,
    )
    .bind(receiptHash)
    .first<{ status: "processing" | "failed"; last_failure: string | null }>();
  if (!request) return { status: "complete" as const };
  return {
    status: request.status,
    message:
      request.status === "failed"
        ? "ファイルを削除できませんでした。再試行してください。"
        : undefined,
  };
};

export const getAccountDeletionStatusForUser = async (
  database: D1Database,
  userId: string,
) =>
  database
    .prepare("SELECT status FROM account_deletion_requests WHERE user_id = ?")
    .bind(userId)
    .first<{ status: Exclude<AccountDeletionStatus, "complete"> }>();

export const replaceAccountDeletionReceipt = async (
  database: D1Database,
  userId: string,
  receiptHash: string,
) => {
  const result = await database
    .prepare(
      `UPDATE account_deletion_requests
       SET receipt_hash = ?, updated_at = CURRENT_TIMESTAMP
       WHERE user_id = ?`,
    )
    .bind(receiptHash, userId)
    .run();
  return Number(result.meta.changes ?? 0) === 1;
};

export const retryAccountDeletion = async (
  database: D1Database,
  receiptHash: string,
) => {
  const request = await database
    .prepare(
      "SELECT user_id FROM account_deletion_requests WHERE receipt_hash = ?",
    )
    .bind(receiptHash)
    .first<{ user_id: string }>();
  if (!request) return false;
  await database.batch([
    database
      .prepare(
        `UPDATE r2_deletion_jobs
         SET status = 'pending', attempt_count = 0,
             next_attempt_at = CURRENT_TIMESTAMP, lease_until = NULL,
             last_failure = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE owner_user_id = ? AND status = 'failed'`,
      )
      .bind(request.user_id),
    database
      .prepare(
        `UPDATE account_deletion_requests
         SET status = 'processing', last_failure = NULL,
             updated_at = CURRENT_TIMESTAMP
         WHERE receipt_hash = ?`,
      )
      .bind(receiptHash),
  ]);
  return true;
};

export const finalizeAccountDeletions = async (
  env: AccountDeletionEnvironment,
) => {
  const requests = await env.MY_MEMO_D1.prepare(
    "SELECT user_id FROM account_deletion_requests",
  ).all<{ user_id: string }>();

  for (const request of requests.results) {
    const jobs = await env.MY_MEMO_D1.prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed
       FROM r2_deletion_jobs WHERE owner_user_id = ?`,
    )
      .bind(request.user_id)
      .first<{ total: number; failed: number | null }>();
    if (Number(jobs?.failed ?? 0) > 0) {
      await env.MY_MEMO_D1.prepare(
        `UPDATE account_deletion_requests
         SET status = 'failed', last_failure = 'R2DeletionFailed',
             updated_at = CURRENT_TIMESTAMP
         WHERE user_id = ?`,
      )
        .bind(request.user_id)
        .run();
      continue;
    }
    if (Number(jobs?.total ?? 0) > 0) continue;

    const user = await env.MY_MEMO_D1.prepare(
      "SELECT email FROM user WHERE id = ?",
    )
      .bind(request.user_id)
      .first<{ email: string }>();
    if (!user) continue;
    await env.MY_MEMO_D1.batch([
      env.MY_MEMO_D1.prepare(
        `DELETE FROM authorization_audit_logs
         WHERE actor_user_id = ? OR target_user_id = ?`,
      ).bind(request.user_id, request.user_id),
      env.MY_MEMO_D1.prepare(
        "DELETE FROM verification WHERE identifier = ?",
      ).bind(user.email),
      env.MY_MEMO_D1.prepare("DELETE FROM user WHERE id = ?").bind(
        request.user_id,
      ),
    ]);
  }
};
