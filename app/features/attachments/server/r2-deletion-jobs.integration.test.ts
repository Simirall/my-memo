import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  enqueueAttachmentDeletion,
  enqueueMemoDeletion,
  processR2DeletionJobs,
} from "./r2-deletion-jobs";

const database = env.MY_MEMO_D1;

const run = (sql: string, ...values: unknown[]) =>
  database
    .prepare(sql)
    .bind(...values)
    .run();

const addUser = async (id: string) => {
  const now = Date.now();
  await run(
    `INSERT INTO user
       (id, name, email, email_verified, role, plan_id, created_at, updated_at)
     VALUES (?, ?, ?, 1, 'user', 'free', ?, ?)`,
    id,
    id,
    `${id}@example.com`,
    now,
    now,
  );
};

const addMemo = (id: string, userId: string) =>
  run(
    "INSERT INTO memos (id, user_id, title) VALUES (?, ?, ?)",
    id,
    userId,
    id,
  );

const addAttachment = (
  id: string,
  memoId: string,
  userId: string,
  thumbnail = false,
) =>
  run(
    `INSERT INTO memo_attachments
       (id, memo_id, user_id, r2_key, thumbnail_r2_key,
        thumbnail_content_type, thumbnail_size_bytes,
        file_name, content_type, size_bytes, etag)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'application/octet-stream', 1, 'etag')`,
    id,
    memoId,
    userId,
    `objects/${id}`,
    thumbnail ? `objects/${id}.thumbnail` : null,
    thumbnail ? "image/avif" : null,
    thumbnail ? 1 : null,
    `${id}.bin`,
  );

beforeEach(async () => {
  await database.batch([
    database.prepare("DELETE FROM r2_deletion_jobs"),
    database.prepare("DELETE FROM memo_attachments"),
    database.prepare("DELETE FROM memos"),
    database.prepare("DELETE FROM user"),
  ]);
});

describe("R2削除ジョブ", () => {
  it("添付の論理削除とジョブ登録を原子的に行い実体を回収する", async () => {
    await addUser("owner");
    await addMemo("memo", "owner");
    await addAttachment("attachment", "memo", "owner", true);
    const deleteObject = vi.fn(async () => undefined);

    expect(
      await enqueueAttachmentDeletion(database, "attachment", "owner"),
    ).toBe(true);
    expect(
      await database.prepare("SELECT id FROM memo_attachments").first(),
    ).toBeNull();
    expect(
      await database
        .prepare("SELECT count(*) AS count FROM r2_deletion_jobs")
        .first<number>("count"),
    ).toBe(2);

    expect(
      await processR2DeletionJobs(env, {
        // 登録直後のジョブがDB既定時刻との秒境界で未来扱いにならないようにする。
        now: new Date(Date.now() + 1000),
        deleteObject,
      }),
    ).toEqual({ deleted: 2, failed: 0 });
    expect(deleteObject).toHaveBeenCalledTimes(2);
    expect(
      await database
        .prepare("SELECT count(*) AS count FROM r2_deletion_jobs")
        .first<number>("count"),
    ).toBe(0);
  });

  it("D1削除失敗時は同一batchのジョブ登録もロールバックする", async () => {
    await addUser("rollback-owner");
    await addMemo("rollback-memo", "rollback-owner");
    await addAttachment(
      "rollback-attachment",
      "rollback-memo",
      "rollback-owner",
    );
    await run(
      `CREATE TRIGGER reject_attachment_delete
       BEFORE DELETE ON memo_attachments
       BEGIN SELECT RAISE(ABORT, 'delete rejected'); END`,
    );

    try {
      await expect(
        enqueueAttachmentDeletion(
          database,
          "rollback-attachment",
          "rollback-owner",
        ),
      ).rejects.toThrow();
      expect(
        await database
          .prepare("SELECT count(*) AS count FROM r2_deletion_jobs")
          .first<number>("count"),
      ).toBe(0);
      expect(
        await database
          .prepare("SELECT id FROM memo_attachments WHERE id = ?")
          .bind("rollback-attachment")
          .first("id"),
      ).toBe("rollback-attachment");
    } finally {
      await run("DROP TRIGGER reject_attachment_delete");
    }
  });

  it("R2失敗後は15分後に再試行して成功する", async () => {
    const now = new Date("2026-08-12T00:00:00.000Z");
    await run(
      `INSERT INTO r2_deletion_jobs
         (id, owner_user_id, object_key, next_attempt_at)
       VALUES ('retry-job', 'owner', 'objects/retry', ?)`,
      now.toISOString(),
    );

    expect(
      await processR2DeletionJobs(env, {
        now,
        deleteObject: async () => {
          throw new TypeError("private detail");
        },
      }),
    ).toEqual({ deleted: 0, failed: 1 });
    expect(
      await database
        .prepare(
          "SELECT status, attempt_count, next_attempt_at, last_failure FROM r2_deletion_jobs WHERE id = 'retry-job'",
        )
        .first(),
    ).toMatchObject({
      status: "pending",
      attempt_count: 1,
      next_attempt_at: "2026-08-12T00:15:00.000Z",
      last_failure: "TypeError",
    });

    const deleteObject = vi.fn(async () => undefined);
    expect(
      await processR2DeletionJobs(env, {
        now: new Date("2026-08-12T00:14:59.999Z"),
        deleteObject,
      }),
    ).toEqual({ deleted: 0, failed: 0 });
    expect(
      await processR2DeletionJobs(env, {
        now: new Date("2026-08-12T00:15:00.000Z"),
        deleteObject,
      }),
    ).toEqual({ deleted: 1, failed: 0 });
  });

  it("有効なleaseは奪わず8回目の失敗をfailedで保持する", async () => {
    const now = new Date("2026-08-12T00:00:00.000Z");
    await run(
      `INSERT INTO r2_deletion_jobs
         (id, owner_user_id, object_key, status, attempt_count,
          next_attempt_at, lease_until)
       VALUES
         ('leased-job', 'owner', 'objects/leased', 'processing', 0, ?, ?),
         ('final-job', 'owner', 'objects/final', 'pending', 7, ?, NULL)`,
      now.toISOString(),
      "2026-08-12T00:05:00.000Z",
      now.toISOString(),
    );
    const deleteObject = vi.fn(async () => {
      throw new Error("do not persist this message");
    });

    expect(await processR2DeletionJobs(env, { now, deleteObject })).toEqual({
      deleted: 0,
      failed: 1,
    });
    expect(deleteObject).toHaveBeenCalledTimes(1);
    expect(
      await database
        .prepare(
          "SELECT status, attempt_count, last_failure FROM r2_deletion_jobs WHERE id = 'final-job'",
        )
        .first(),
    ).toMatchObject({
      status: "failed",
      attempt_count: 8,
      last_failure: "Error",
    });
  });

  it("別所有者と二重削除ではジョブを増やさない", async () => {
    await addUser("owner-a");
    await addUser("owner-b");
    await addMemo("owned-memo", "owner-a");
    await addAttachment("owned-file", "owned-memo", "owner-a");

    expect(
      await enqueueAttachmentDeletion(database, "owned-file", "owner-b"),
    ).toBe(false);
    expect(
      await enqueueAttachmentDeletion(database, "owned-file", "owner-a"),
    ).toBe(true);
    expect(
      await enqueueAttachmentDeletion(database, "owned-file", "owner-a"),
    ).toBe(false);
    expect(
      await database
        .prepare("SELECT count(*) AS count FROM r2_deletion_jobs")
        .first<number>("count"),
    ).toBe(1);
  });

  it("メモ配下の全添付をジョブ化してメモを削除する", async () => {
    await addUser("memo-owner");
    await addMemo("delete-memo", "memo-owner");
    await addAttachment("first", "delete-memo", "memo-owner", true);
    await addAttachment("second", "delete-memo", "memo-owner");

    expect(
      await enqueueMemoDeletion(database, "delete-memo", "memo-owner"),
    ).toBe(true);
    expect(
      await database
        .prepare("SELECT id FROM memos WHERE id = 'delete-memo'")
        .first(),
    ).toBeNull();
    expect(
      await database
        .prepare("SELECT count(*) AS count FROM r2_deletion_jobs")
        .first<number>("count"),
    ).toBe(3);
  });
});
