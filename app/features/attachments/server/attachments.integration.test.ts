import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import {
  getAppDb,
  getUsage,
  PLAN_METRICS,
} from "@/features/access-control/authorization";
import { insertAttachmentWithinQuota } from "@/features/access-control/quota";
import {
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS_PER_MEMO,
} from "@/features/attachments/model/attachment-constants";
import { getAttachmentQuota, parseAttachmentRange } from "./attachments";
import { cleanupExpiredUploads } from "./expired-upload-cleanup";
import { putR2ObjectWithKnownLength } from "./r2-upload";
import { reserveAttachmentUpload } from "./upload-reservations";

const db = env.MY_MEMO_D1;
const bucket = env.MY_MEMO_FILES;

async function run(sql: string, ...values: unknown[]) {
  return db
    .prepare(sql)
    .bind(...values)
    .run();
}

async function addUser(id: string, planId = "free") {
  const now = Date.now();
  await run(
    `INSERT INTO user
      (id, name, email, email_verified, role, plan_id, created_at, updated_at)
     VALUES (?, ?, ?, 1, 'user', ?, ?, ?)`,
    id,
    id,
    `${id}@example.com`,
    planId,
    now,
    now,
  );
}

async function addMemo(id: string, userId: string) {
  await run(
    "INSERT INTO memos (id, user_id, title, content) VALUES (?, ?, ?, ?)",
    id,
    userId,
    id,
    id,
  );
}

async function addAttachment(
  id: string,
  userId: string,
  memoId: string,
  r2Key: string,
  sizeBytes: number,
) {
  return insertAttachmentWithinQuota(db, {
    id,
    userId,
    memoId,
    r2Key,
    fileName: `${id}.bin`,
    contentType: "application/octet-stream",
    sizeBytes,
    etag: `etag-${id}`,
  });
}

beforeEach(async () => {
  await db.batch([
    db.prepare("DELETE FROM attachment_upload_reservations"),
    db.prepare("DELETE FROM memo_attachments"),
    db.prepare("DELETE FROM memos"),
    db.prepare("DELETE FROM user"),
    db.prepare("DELETE FROM plan_limits WHERE plan_id <> 'free'"),
    db.prepare("DELETE FROM plans WHERE id <> 'free'"),
    db.prepare(
      "UPDATE plan_limits SET limit_value = 524288000 WHERE plan_id = 'free' AND metric = 'attachment.storage_bytes'",
    ),
  ]);
});

describe("添付ファイル容量とR2実体の整合性", () => {
  it("HTTP RangeをローカルR2でも扱えるプレーンな範囲へ変換する", () => {
    expect(parseAttachmentRange("bytes=0-", 10)).toEqual({
      offset: 0,
      length: 10,
    });
    expect(parseAttachmentRange("bytes=2-4", 10)).toEqual({
      offset: 2,
      length: 3,
    });
    expect(parseAttachmentRange("bytes=-3", 10)).toEqual({
      offset: 7,
      length: 3,
    });
    expect(parseAttachmentRange("bytes=10-", 10)).toBeNull();
    expect(parseAttachmentRange("bytes=0-1,4-5", 10)).toBeNull();
  });

  it("FixedLengthStreamがないローカル実行でも申告サイズを検証してR2へ保存する", async () => {
    const r2Key = "tests/local-runtime-fallback";
    const body = new Blob(["local body"]).stream();
    const object = await putR2ObjectWithKnownLength(
      bucket,
      r2Key,
      body,
      10,
      undefined,
      null,
    );

    expect(object.size).toBe(10);
    expect(await (await bucket.get(r2Key))?.text()).toBe("local body");
    await bucket.delete(r2Key);
  });

  it("ローカル実行の申告サイズと実サイズが異なる場合はR2へ保存しない", async () => {
    const r2Key = "tests/local-runtime-size-mismatch";

    await expect(
      putR2ObjectWithKnownLength(
        bucket,
        r2Key,
        new Blob(["too long"]).stream(),
        3,
        undefined,
        null,
      ),
    ).rejects.toThrow("実サイズ");
    expect(await bucket.head(r2Key)).toBeNull();
  });

  it("R2が返した実サイズをD1へ記録し、使用量へ反映する", async () => {
    await addUser("attachment-user");
    await addMemo("attachment-memo", "attachment-user");
    const r2Key = "tests/attachment-real-size";
    const object = await bucket.put(r2Key, new Blob(["実体サイズ"]));
    if (!object) throw new Error("R2オブジェクトが作成されませんでした。");

    expect(object.size).toBeGreaterThan(0);
    expect(
      await addAttachment(
        "attachment-1",
        "attachment-user",
        "attachment-memo",
        r2Key,
        object.size,
      ),
    ).toBe(true);
    expect(
      await getUsage(
        getAppDb(env),
        "attachment-user",
        PLAN_METRICS.attachmentStorageBytes,
      ),
    ).toBe(object.size);
    expect(
      (await getAttachmentQuota(getAppDb(env), "attachment-user"))?.remaining,
    ).toBe(524288000 - object.size);

    await bucket.delete(r2Key);
  });

  it("容量境界で同時に追加しても上限を超える行を確定しない", async () => {
    await run(
      "INSERT INTO plans (id, code, name, is_default, is_active) VALUES ('tiny', 'tiny', 'tiny', 0, 1)",
    );
    await run(
      "INSERT INTO plan_limits (plan_id, metric, limit_value) VALUES ('tiny', 'attachment.storage_bytes', 10)",
    );
    await addUser("tiny-user", "tiny");
    await addMemo("tiny-memo", "tiny-user");
    const keys = ["tests/tiny-a", "tests/tiny-b"];
    await Promise.all(keys.map((key) => bucket.put(key, new Blob(["123456"]))));

    const results = await Promise.all(
      keys.map((r2Key, index) =>
        addAttachment(`tiny-${index}`, "tiny-user", "tiny-memo", r2Key, 6),
      ),
    );

    expect(results.filter(Boolean)).toHaveLength(1);
    const usage = await getUsage(
      getAppDb(env),
      "tiny-user",
      PLAN_METRICS.attachmentStorageBytes,
    );
    expect(usage).toBeLessThanOrEqual(10);
    expect(MAX_ATTACHMENT_BYTES).toBe(25 * 1024 * 1024);
    expect(MAX_ATTACHMENTS_PER_MEMO).toBe(5);

    await Promise.all(keys.map((key) => bucket.delete(key)));
  });

  it("仮アップロードを並行予約しても原本容量上限を超えない", async () => {
    await run(
      "INSERT INTO plans (id, code, name, is_default, is_active) VALUES ('reservation-tiny', 'reservation-tiny', 'reservation-tiny', 0, 1)",
    );
    await run(
      "INSERT INTO plan_limits (plan_id, metric, limit_value) VALUES ('reservation-tiny', 'attachment.storage_bytes', 10)",
    );
    await addUser("reservation-user", "reservation-tiny");
    await addMemo("reservation-memo", "reservation-user");

    // 条件付きINSERTが直列化され、同時要求でも片方だけが容量を確保する。
    const reservations = await Promise.all(
      ["a", "b"].map((suffix) =>
        reserveAttachmentUpload(db, {
          userId: "reservation-user",
          memoId: "reservation-memo",
          r2Key: `tests/reservation-${suffix}`,
          sizeBytes: 6,
        }),
      ),
    );

    expect(reservations.filter(Boolean)).toHaveLength(1);
  });

  it("サムネイル容量を利用量へ加算しない", async () => {
    await addUser("thumbnail-user");
    await addMemo("thumbnail-memo", "thumbnail-user");
    await run(
      `INSERT INTO memo_attachments
        (id, memo_id, user_id, r2_key, thumbnail_r2_key, thumbnail_content_type, thumbnail_size_bytes, file_name, content_type, size_bytes, etag)
       VALUES ('thumbnail-attachment', 'thumbnail-memo', 'thumbnail-user', 'tests/original', 'tests/thumbnail', 'image/avif', 1000000, 'image.png', 'image/png', 7, 'etag')`,
    );

    expect(
      await getUsage(
        getAppDb(env),
        "thumbnail-user",
        PLAN_METRICS.attachmentStorageBytes,
      ),
    ).toBe(7);
  });

  it("期限切れ予約の原本とサムネイルを回収する", async () => {
    await addUser("expired-user");
    await addMemo("expired-memo", "expired-user");
    const originalKey = "tests/expired-original";
    const thumbnailKey = "tests/expired-thumbnail";
    await Promise.all([
      bucket.put(originalKey, "original"),
      bucket.put(thumbnailKey, "thumbnail"),
    ]);
    await run(
      `INSERT INTO attachment_upload_reservations
        (id, user_id, memo_id, r2_key, thumbnail_r2_key, size_bytes, status, expires_at)
       VALUES ('expired-reservation', 'expired-user', 'expired-memo', ?, ?, 8, 'pending', ?)`,
      originalKey,
      thumbnailKey,
      new Date(Date.now() - 1_000).toISOString(),
    );

    await cleanupExpiredUploads(env);

    expect(await bucket.head(originalKey)).toBeNull();
    expect(await bucket.head(thumbnailKey)).toBeNull();
    expect(
      await db
        .prepare("SELECT id FROM attachment_upload_reservations WHERE id = ?")
        .bind("expired-reservation")
        .first(),
    ).toBeNull();
  });
});
