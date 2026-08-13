import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { processR2DeletionJobs } from "@/features/attachments/server/r2-deletion-jobs";
import {
  finalizeAccountDeletions,
  getAccountDeletionStatus,
  hashDeletionReceipt,
  replaceAccountDeletionReceipt,
  retryAccountDeletion,
  startAccountDeletion,
} from "./account-deletion";

const db = env.MY_MEMO_D1;
const run = (sql: string, ...values: unknown[]) =>
  db
    .prepare(sql)
    .bind(...values)
    .run();

const addUser = async (id: string) => {
  const now = Date.now();
  await run(
    `INSERT INTO user
      (id, name, email, email_verified, role, plan_id, created_at, updated_at)
     VALUES (?, ?, ?, 1, 'admin', 'free', ?, ?)`,
    id,
    id,
    `${id}@example.com`,
    now,
    now,
  );
};

beforeEach(async () => {
  await db.batch([
    db.prepare("DELETE FROM account_deletion_requests"),
    db.prepare("DELETE FROM r2_deletion_jobs"),
    db.prepare("DELETE FROM authorization_audit_logs"),
    db.prepare("DELETE FROM attachment_upload_reservations"),
    db.prepare("DELETE FROM share_intake_files"),
    db.prepare("DELETE FROM share_intakes"),
    db.prepare("DELETE FROM memo_attachments"),
    db.prepare("DELETE FROM memos"),
    db.prepare("DELETE FROM link_preview_cache"),
    db.prepare("DELETE FROM verification"),
    db.prepare("DELETE FROM user"),
  ]);
});

describe("退会処理", () => {
  it("R2を削除した後だけ本人の全データを削除し共有キャッシュを残す", async () => {
    await addUser("owner");
    await addUser("other");
    await run(
      "INSERT INTO memos (id, user_id, title) VALUES ('memo', 'owner', '題名')",
    );
    await run(
      `INSERT INTO memo_attachments
        (id, memo_id, user_id, r2_key, thumbnail_r2_key, file_name,
         content_type, size_bytes, thumbnail_content_type,
         thumbnail_size_bytes, etag)
       VALUES ('attachment', 'memo', 'owner', 'owner/original',
         'owner/thumbnail', 'file.png', 'image/png', 1, 'image/webp', 1, 'etag')`,
    );
    await run(
      `INSERT INTO share_intakes
        (id, user_id, title, text, status, expires_at)
       VALUES ('share', 'owner', '', '', 'pending', '2099-01-01')`,
    );
    await run(
      `INSERT INTO share_intake_files
        (id, share_intake_id, user_id, reservation_id, r2_key,
         file_name, content_type, size_bytes, etag)
       VALUES ('share-file', 'share', 'owner', 'share-reservation',
         'owner/share', 'share.png', 'image/png', 1, 'etag')`,
    );
    await run(
      `INSERT INTO attachment_upload_reservations
        (id, user_id, r2_key, thumbnail_r2_key, size_bytes, status, expires_at)
       VALUES ('reservation', 'owner', 'owner/pending',
         'owner/pending-thumbnail', 1, 'pending', '2099-01-01')`,
    );
    await run(
      "INSERT INTO usage_counters (user_id, metric, period_start) VALUES ('owner', 'memo.total', '2026-08-01')",
    );
    await run(
      `INSERT INTO authorization_audit_logs
        (id, actor_user_id, target_user_id, action)
       VALUES ('audit', 'owner', 'other', 'update')`,
    );
    await run(
      `INSERT INTO verification
        (id, identifier, value, expires_at)
       VALUES ('verification', 'owner@example.com', 'value', 9999999999999)`,
    );
    await run(
      `INSERT INTO link_preview_cache (normalized_url)
       VALUES ('https://example.com/')`,
    );
    for (const key of [
      "owner/original",
      "owner/thumbnail",
      "owner/share",
      "owner/pending",
      "owner/pending-thumbnail",
    ]) {
      await env.MY_MEMO_FILES.put(key, "x");
    }

    const receiptHash = await hashDeletionReceipt("receipt");
    await startAccountDeletion(db, "owner", receiptHash);
    await finalizeAccountDeletions(env);
    expect(
      await db.prepare("SELECT id FROM user WHERE id = 'owner'").first(),
    ).not.toBeNull();

    await processR2DeletionJobs(env);
    await finalizeAccountDeletions(env);

    expect(
      await db.prepare("SELECT id FROM user WHERE id = 'owner'").first(),
    ).toBeNull();
    expect(
      await db.prepare("SELECT id FROM user WHERE id = 'other'").first(),
    ).not.toBeNull();
    expect(
      await db.prepare("SELECT id FROM authorization_audit_logs").first(),
    ).toBeNull();
    expect(await db.prepare("SELECT id FROM verification").first()).toBeNull();
    expect(
      await db.prepare("SELECT normalized_url FROM link_preview_cache").first(),
    ).not.toBeNull();
    for (const key of [
      "owner/original",
      "owner/thumbnail",
      "owner/share",
      "owner/pending",
      "owner/pending-thumbnail",
    ]) {
      expect(await env.MY_MEMO_FILES.get(key)).toBeNull();
    }
    expect(await getAccountDeletionStatus(db, receiptHash)).toEqual({
      status: "complete",
    });
  });

  it("R2削除失敗時は本人を残し再試行できる", async () => {
    await addUser("owner");
    await run(
      "INSERT INTO memos (id, user_id, title) VALUES ('memo', 'owner', '題名')",
    );
    await run(
      `INSERT INTO memo_attachments
        (id, memo_id, user_id, r2_key, file_name, content_type,
         size_bytes, etag)
       VALUES ('attachment', 'memo', 'owner', 'owner/failure',
         'file.png', 'image/png', 1, 'etag')`,
    );
    const receiptHash = await hashDeletionReceipt("retry-receipt");
    await startAccountDeletion(db, "owner", receiptHash);

    // 再試行時刻を越えて8回失敗させ、停止状態を再現する。
    for (let attempt = 0; attempt < 8; attempt += 1) {
      await processR2DeletionJobs(env, {
        now: new Date(Date.UTC(2030, 0, 1 + attempt * 2)),
        deleteObject: async () => {
          throw new Error("R2 unavailable");
        },
      });
    }
    await finalizeAccountDeletions(env);

    expect(
      await db.prepare("SELECT id FROM user WHERE id = 'owner'").first(),
    ).not.toBeNull();
    expect((await getAccountDeletionStatus(db, receiptHash)).status).toBe(
      "failed",
    );
    expect(await retryAccountDeletion(db, receiptHash)).toBe(true);
    expect((await getAccountDeletionStatus(db, receiptHash)).status).toBe(
      "processing",
    );
  });

  it("退会受付後の新しいR2参照行をDBで拒否する", async () => {
    await addUser("owner");
    await startAccountDeletion(
      db,
      "owner",
      await hashDeletionReceipt("locked-receipt"),
    );

    await expect(
      run(
        `INSERT INTO attachment_upload_reservations
          (id, user_id, r2_key, size_bytes, status, expires_at)
         VALUES ('late', 'owner', 'owner/late', 1, 'pending', '2099-01-01')`,
      ),
    ).rejects.toThrow("account deletion is in progress");
  });

  it("退会要求を二重送信しても最初の要求を維持する", async () => {
    await addUser("owner");
    const firstHash = await hashDeletionReceipt("first-receipt");

    expect(await startAccountDeletion(db, "owner", firstHash)).toMatchObject({
      created: true,
    });
    expect(
      await startAccountDeletion(
        db,
        "owner",
        await hashDeletionReceipt("second-receipt"),
      ),
    ).toMatchObject({ created: false });
    expect((await getAccountDeletionStatus(db, firstHash)).status).toBe(
      "processing",
    );
  });

  it("確認情報を失っても本人用の新しいreceiptへ差し替えられる", async () => {
    await addUser("owner");
    const expiredHash = await hashDeletionReceipt("expired-receipt");
    const replacementHash = await hashDeletionReceipt("replacement-receipt");
    await startAccountDeletion(db, "owner", expiredHash);

    expect(
      await replaceAccountDeletionReceipt(db, "owner", replacementHash),
    ).toBe(true);
    expect((await getAccountDeletionStatus(db, expiredHash)).status).toBe(
      "complete",
    );
    expect((await getAccountDeletionStatus(db, replacementHash)).status).toBe(
      "processing",
    );
  });
});
