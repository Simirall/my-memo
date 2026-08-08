import { env } from "cloudflare:workers";
import { Hono } from "hono";
import { beforeEach, describe, expect, it } from "vitest";
import { normalizePendingShare } from "@/routes/-features/sharing";
import {
  createShareIntake,
  validateSharedFiles,
} from "@/routes/-features/sharing/share-intake";
import shareIntakesRoute from "./share-intakes/index";

const db = env.MY_MEMO_D1;

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

function appForUser(userId: string) {
  const app = new Hono<{ Bindings: CloudflareBindings }>();
  app.use("*", async (c, next) => {
    c.set("user", { id: userId } as never);
    c.set("session", null);
    await next();
  });
  app.route("/api/share-intakes", shareIntakesRoute);
  return app;
}

const fakeFile = (name: string, size: number) =>
  ({
    name,
    size,
    type: "application/octet-stream",
    stream: () => new ReadableStream(),
  }) as File;

beforeEach(async () => {
  await db.batch([
    db.prepare("DELETE FROM share_intakes"),
    db.prepare("DELETE FROM memo_attachments"),
    db.prepare("DELETE FROM memos"),
    db.prepare("DELETE FROM user"),
  ]);
});

describe("共有メディア仮保存API", () => {
  it("仮保存したファイルを個別除外し、残りをメモとして確定する", async () => {
    await addUser("share-owner");
    const file = new File(["abc"], "写真.png", { type: "image/png" });
    const intake = await createShareIntake(
      env,
      "share-owner",
      normalizePendingShare({
        title: "共有タイトル",
        text: "共有コメント",
        url: "https://example.com/article",
      }),
      [file, new File(["def"], "除外.txt", { type: "text/plain" })],
    );
    const staged = await db
      .prepare(
        "SELECT id, r2_key, file_name FROM share_intake_files WHERE share_intake_id = ?",
      )
      .bind(intake.id)
      .all<{ id: string; r2_key: string; file_name: string }>();
    expect(staged.results).toHaveLength(2);
    const kept = staged.results.find((file) => file.file_name === "写真.png");
    const excluded = staged.results.find(
      (file) => file.file_name === "除外.txt",
    );
    expect(kept).toBeDefined();
    expect(excluded).toBeDefined();
    const ownerApp = appForUser("share-owner");
    const otherPreview = await appForUser("share-other").fetch(
      new Request(
        `https://example.test/api/share-intakes/${intake.id}/files/${kept?.id}`,
      ),
      env,
    );
    expect(otherPreview.status).toBe(404);
    const preview = await ownerApp.fetch(
      new Request(
        `https://example.test/api/share-intakes/${intake.id}/files/${kept?.id}`,
      ),
      env,
    );
    expect(preview.status).toBe(200);
    expect(preview.headers.get("Content-Disposition")).toBe("inline");
    expect(preview.headers.get("Accept-Ranges")).toBe("bytes");

    const rangePreview = await ownerApp.fetch(
      new Request(
        `https://example.test/api/share-intakes/${intake.id}/files/${kept?.id}`,
        { headers: { Range: "bytes=0-1" } },
      ),
      env,
    );
    expect(rangePreview.status).toBe(206);
    expect(rangePreview.headers.get("Content-Range")).toBe("bytes 0-1/3");
    expect(rangePreview.headers.get("Content-Length")).toBe("2");
    expect(
      Array.from(new Uint8Array(await rangePreview.arrayBuffer())),
    ).toEqual([97, 98]);

    const invalidRange = await ownerApp.fetch(
      new Request(
        `https://example.test/api/share-intakes/${intake.id}/files/${kept?.id}`,
        { headers: { Range: "bytes=3-" } },
      ),
      env,
    );
    expect(invalidRange.status).toBe(416);
    expect(invalidRange.headers.get("Content-Range")).toBe("bytes */3");

    const removed = await ownerApp.fetch(
      new Request(
        `https://example.test/api/share-intakes/${intake.id}/files/${excluded?.id}`,
        { method: "DELETE" },
      ),
      env,
    );
    expect(removed.status).toBe(200);
    const removedPayload = (await removed.json()) as { files: unknown[] };
    expect(removedPayload.files).toHaveLength(1);
    expect(await env.MY_MEMO_FILES.head(excluded?.r2_key ?? "")).toBeNull();

    const form = new FormData();
    form.set("title", "確定タイトル");
    form.set("content", "確定本文");
    form.set("url", "https://example.com/article");
    form.set("categoryId", "");
    form.set("tags", JSON.stringify(["共有"]));
    form.set(
      "mediaDimensions",
      JSON.stringify([{ fileId: kept?.id, width: 1, height: 1 }]),
    );
    const finalized = await ownerApp.fetch(
      new Request(
        `https://example.test/api/share-intakes/${intake.id}/finalize`,
        { method: "POST", body: form },
      ),
      env,
    );
    expect(finalized.status).toBe(200);
    const payload = (await finalized.json()) as { memoId: string };
    expect(payload.memoId).toBeTruthy();

    const memo = await db
      .prepare("SELECT title, content, url FROM memos WHERE id = ?")
      .bind(payload.memoId)
      .first();
    expect(memo).toEqual({
      title: "確定タイトル",
      content: "確定本文",
      url: "https://example.com/article",
    });
    const saved = await db
      .prepare(
        "SELECT r2_key, file_name, media_width, media_height FROM memo_attachments WHERE memo_id = ?",
      )
      .bind(payload.memoId)
      .first<{
        r2_key: string;
        file_name: string;
        media_width: number;
        media_height: number;
      }>();
    expect(saved?.file_name).toBe("写真.png");
    expect(saved?.media_width).toBe(1);
    expect(saved?.media_height).toBe(1);
    expect(saved?.r2_key).toContain(`/memos/${payload.memoId}/`);
    expect(await env.MY_MEMO_FILES.head(saved?.r2_key ?? "")).not.toBeNull();
    expect(await env.MY_MEMO_FILES.head(kept?.r2_key ?? "")).toBeNull();

    const duplicate = await ownerApp.fetch(
      new Request(
        `https://example.test/api/share-intakes/${intake.id}/finalize`,
        { method: "POST", body: form },
      ),
      env,
    );
    expect(duplicate.status).toBe(409);
  });

  it("所有者以外の個別除外と、上限超過の共有を拒否する", async () => {
    await addUser("share-owner");
    await addUser("share-other");
    const intake = await createShareIntake(
      env,
      "share-owner",
      normalizePendingShare({ text: "添付" }),
      [new File(["abc"], "a.txt", { type: "text/plain" })],
    );
    const file = await db
      .prepare("SELECT id FROM share_intake_files WHERE share_intake_id = ?")
      .bind(intake.id)
      .first<{ id: string }>();
    const forbidden = await appForUser("share-other").fetch(
      new Request(
        `https://example.test/api/share-intakes/${intake.id}/files/${file?.id}`,
        { method: "DELETE" },
      ),
      env,
    );
    expect(forbidden.status).toBe(404);

    await expect(
      validateSharedFiles(
        [fakeFile("large.bin", 25 * 1024 * 1024 + 1)],
        "share-owner",
        env,
      ),
    ).rejects.toMatchObject({ status: 413 });
    await expect(
      validateSharedFiles(
        Array.from({ length: 6 }, (_, index) => fakeFile(`${index}.bin`, 1)),
        "share-owner",
        env,
      ),
    ).rejects.toMatchObject({ status: 413 });
    await expect(
      validateSharedFiles(
        [
          fakeFile("a.bin", 40 * 1024 * 1024),
          fakeFile("b.bin", 35 * 1024 * 1024),
        ],
        "share-owner",
        env,
      ),
    ).rejects.toMatchObject({ status: 413 });
  });

  it("確定中の共有はキャンセルできない", async () => {
    await addUser("share-owner");
    const intake = await createShareIntake(
      env,
      "share-owner",
      normalizePendingShare({ text: "確定中" }),
      [new File(["abc"], "a.txt", { type: "text/plain" })],
    );
    await run(
      "UPDATE share_intakes SET status = 'finalizing' WHERE id = ?",
      intake.id,
    );

    const response = await appForUser("share-owner").fetch(
      new Request(`https://example.test/api/share-intakes/${intake.id}`, {
        method: "DELETE",
      }),
      env,
    );
    expect(response.status).toBe(409);

    const row = await db
      .prepare("SELECT status FROM share_intakes WHERE id = ?")
      .bind(intake.id)
      .first<{ status: string }>();
    expect(row?.status).toBe("finalizing");
  });

  it("確定時に添付容量を超えた場合は500にせず仮共有を保持する", async () => {
    await addUser("share-owner");
    const intake = await createShareIntake(
      env,
      "share-owner",
      normalizePendingShare({ text: "容量再検証" }),
      [new File(["abc"], "a.txt", { type: "text/plain" })],
    );
    const staged = await db
      .prepare(
        "SELECT r2_key FROM share_intake_files WHERE share_intake_id = ?",
      )
      .bind(intake.id)
      .first<{ r2_key: string }>();

    await run(
      "UPDATE plan_limits SET limit_value = 2 WHERE plan_id = 'free' AND metric = 'attachment.storage_bytes'",
    );
    try {
      const form = new FormData();
      form.set("title", "容量再検証");
      form.set("content", "容量再検証");
      form.set("categoryId", "");
      form.set("tags", "[]");
      const response = await appForUser("share-owner").fetch(
        new Request(
          `https://example.test/api/share-intakes/${intake.id}/finalize`,
          { method: "POST", body: form },
        ),
        env,
      );
      expect(response.status).toBe(409);

      const row = await db
        .prepare("SELECT status FROM share_intakes WHERE id = ?")
        .bind(intake.id)
        .first<{ status: string }>();
      expect(row?.status).toBe("pending");
      expect(
        await db
          .prepare("SELECT COUNT(*) AS count FROM memos")
          .first<{ count: number }>(),
      ).toEqual({ count: 0 });
      expect(await env.MY_MEMO_FILES.head(staged?.r2_key ?? "")).not.toBeNull();
    } finally {
      await run(
        "UPDATE plan_limits SET limit_value = 524288000 WHERE plan_id = 'free' AND metric = 'attachment.storage_bytes'",
      );
    }
  });

  it("既存添付が5件以上あっても新しいメモの共有ファイルを確定できる", async () => {
    await addUser("share-owner");
    await run(
      `INSERT INTO memos
        (id, user_id, title, content, is_ai_summary)
       VALUES ('existing-memo', 'share-owner', '既存', '既存', 0)`,
    );
    for (let index = 0; index < 5; index += 1) {
      await run(
        `INSERT INTO memo_attachments
          (id, memo_id, user_id, r2_key, file_name, content_type, size_bytes, etag)
         VALUES (?, 'existing-memo', 'share-owner', ?, ?, 'text/plain', 1, ?)`,
        `existing-attachment-${index}`,
        `users/share-owner/memos/existing-memo/${index}`,
        `${index}.txt`,
        `etag-${index}`,
      );
    }

    const intake = await createShareIntake(
      env,
      "share-owner",
      normalizePendingShare({ text: "新しいメモ" }),
      [new File(["abc"], "new.txt", { type: "text/plain" })],
    );
    const form = new FormData();
    form.set("title", "新しいメモ");
    form.set("content", "新しいメモ");
    form.set("categoryId", "");
    form.set("tags", "[]");

    const response = await appForUser("share-owner").fetch(
      new Request(
        `https://example.test/api/share-intakes/${intake.id}/finalize`,
        { method: "POST", body: form },
      ),
      env,
    );

    expect(response.status).toBe(200);
    expect(
      await db
        .prepare(
          "SELECT COUNT(*) AS count FROM memo_attachments WHERE user_id = 'share-owner'",
        )
        .first<{ count: number }>(),
    ).toEqual({ count: 6 });
  });
});
