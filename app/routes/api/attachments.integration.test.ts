import { env } from "cloudflare:workers";
import { Hono } from "hono";
import { beforeEach, describe, expect, it } from "vitest";
import attachmentsRoute from "./attachments/index";
import memosRoute from "./memos/index";

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

async function addMemo(id: string, userId: string) {
  await run(
    "INSERT INTO memos (id, user_id, title, content) VALUES (?, ?, ?, ?)",
    id,
    userId,
    id,
    id,
  );
}

function appForUser(userId: string) {
  const app = new Hono<{ Bindings: CloudflareBindings }>();
  app.use("*", async (c, next) => {
    c.set("user", { id: userId } as never);
    c.set("session", null);
    await next();
  });
  app.route("/api/memos", memosRoute);
  app.route("/api/attachments", attachmentsRoute);
  return app;
}

beforeEach(async () => {
  await db.batch([
    db.prepare("DELETE FROM memo_attachments"),
    db.prepare("DELETE FROM memos"),
    db.prepare("DELETE FROM user"),
    db.prepare(
      "UPDATE plan_limits SET limit_value = 524288000 WHERE plan_id = 'free' AND metric = 'attachment.storage_bytes'",
    ),
  ]);
});

describe("添付ファイルAPI", () => {
  it("R2実サイズを記録し、所有者だけがRange付きでプレビューできる", async () => {
    await addUser("api-owner");
    await addUser("api-other");
    await addMemo("api-memo", "api-owner");
    const ownerApp = appForUser("api-owner");

    const upload = await ownerApp.fetch(
      new Request("https://example.test/api/memos/api-memo/attachments", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "image/png",
          "X-File-Size": "6",
          "X-File-Name": encodeURIComponent("画像.png"),
        },
        body: "abcdef",
      }),
      env,
    );
    expect(upload.status).toBe(200);
    const uploaded = (await upload.json()) as {
      attachment: { id: string; sizeBytes: number; r2Key: string };
    };
    expect(uploaded.attachment.sizeBytes).toBe(6);

    const preview = await ownerApp.fetch(
      new Request(
        `https://example.test/api/attachments/${uploaded.attachment.id}?preview=1`,
        { headers: { Range: "bytes=0-2" } },
      ),
      env,
    );
    expect(preview.status).toBe(206);
    expect(preview.headers.get("Content-Disposition")).toContain("inline");
    expect(preview.headers.get("Content-Range")).toBe("bytes 0-2/6");
    expect(new TextDecoder().decode(await preview.arrayBuffer())).toBe("abc");

    const suffixPreview = await ownerApp.fetch(
      new Request(
        `https://example.test/api/attachments/${uploaded.attachment.id}?preview=1`,
        { headers: { Range: "bytes=-2" } },
      ),
      env,
    );
    expect(suffixPreview.status).toBe(206);
    expect(suffixPreview.headers.get("Content-Range")).toBe("bytes 4-5/6");
    expect(new TextDecoder().decode(await suffixPreview.arrayBuffer())).toBe(
      "ef",
    );

    const invalidRange = await ownerApp.fetch(
      new Request(
        `https://example.test/api/attachments/${uploaded.attachment.id}?preview=1`,
        { headers: { Range: "bytes=6-" } },
      ),
      env,
    );
    expect(invalidRange.status).toBe(416);
    expect(invalidRange.headers.get("Content-Range")).toBe("bytes */6");

    const other = await appForUser("api-other").fetch(
      new Request(
        `https://example.test/api/attachments/${uploaded.attachment.id}`,
      ),
      env,
    );
    expect(other.status).toBe(404);

    const deleted = await ownerApp.fetch(
      new Request(
        `https://example.test/api/attachments/${uploaded.attachment.id}`,
        { method: "DELETE" },
      ),
      env,
    );
    expect(deleted.status).toBe(200);
    const quotaResponse = await ownerApp.fetch(
      new Request("https://example.test/api/attachments/quota"),
      env,
    );
    expect(await quotaResponse.json()).toMatchObject({ used: 0 });
    expect(await env.MY_MEMO_FILES.head(uploaded.attachment.r2Key)).toBeNull();

    const secondUpload = await ownerApp.fetch(
      new Request("https://example.test/api/memos/api-memo/attachments", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/octet-stream",
          "X-File-Size": "6",
          "X-File-Name": encodeURIComponent("second.bin"),
        },
        body: "second",
      }),
      env,
    );
    const second = (await secondUpload.json()) as {
      attachment: { r2Key: string };
    };
    const deletedMemo = await ownerApp.fetch(
      new Request("https://example.test/api/memos/delete/api-memo", {
        method: "POST",
      }),
      env,
    );
    expect(deletedMemo.status).toBe(302);
    expect(await env.MY_MEMO_FILES.head(second.attachment.r2Key)).toBeNull();
  });

  it("容量超過時はD1へ記録せずR2オブジェクトを補償削除する", async () => {
    await run(
      "INSERT INTO plans (id, code, name, is_default, is_active) VALUES ('api-tiny', 'api-tiny', 'api-tiny', 0, 1)",
    );
    await run(
      "INSERT INTO plan_limits (plan_id, metric, limit_value) VALUES ('api-tiny', 'attachment.storage_bytes', 3)",
    );
    await addUser("api-tiny-user", "api-tiny");
    await addMemo("api-tiny-memo", "api-tiny-user");

    const response = await appForUser("api-tiny-user").fetch(
      new Request("https://example.test/api/memos/api-tiny-memo/attachments", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/octet-stream",
          "X-File-Size": "4",
          "X-File-Name": encodeURIComponent("too-large.bin"),
        },
        body: "1234",
      }),
      env,
    );
    expect(response.status).toBe(409);
    const objects = await env.MY_MEMO_FILES.list({
      prefix: "users/api-tiny-user/memos/api-tiny-memo/",
    });
    expect(objects.objects).toHaveLength(0);
  });

  it("メモ本体・タグ・カテゴリ・添付を一括更新し、AI生成フラグを保持する", async () => {
    await addUser("edit-owner");
    await addUser("edit-other");
    await addMemo("edit-memo", "edit-owner");
    await run(
      "INSERT INTO categories (id, user_id, name) VALUES (?, ?, ?)",
      "edit-category",
      "edit-owner",
      "編集カテゴリ",
    );

    const ownerApp = appForUser("edit-owner");
    const originalUpload = await ownerApp.fetch(
      new Request("https://example.test/api/memos/edit-memo/attachments", {
        method: "POST",
        headers: {
          "Content-Type": "text/plain",
          "X-File-Size": "3",
          "X-File-Name": encodeURIComponent("old.txt"),
        },
        body: "old",
      }),
      env,
    );
    const originalPayload = (await originalUpload.json()) as {
      attachment: { id: string; r2Key: string };
    };

    const stagedResponse = await ownerApp.fetch(
      new Request("https://example.test/api/memos/edit-memo/edit-attachments", {
        method: "POST",
        headers: {
          "Content-Type": "text/plain",
          "X-Edit-Id": "edit-request-1",
          "X-File-Size": "3",
          "X-File-Name": encodeURIComponent("new.txt"),
        },
        body: "new",
      }),
      env,
    );
    expect(stagedResponse.status).toBe(200);
    const stagedPayload = (await stagedResponse.json()) as {
      attachment: {
        token: string;
        fileName: string;
        contentType: string;
        sizeBytes: number;
        etag: string;
      };
    };

    await run("UPDATE memos SET ai_generated = 1 WHERE id = ?", "edit-memo");
    const updated = await ownerApp.fetch(
      new Request("https://example.test/api/memos/edit-memo", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "更新タイトル",
          content: "更新本文",
          url: "https://example.test/updated",
          categoryId: "edit-category",
          tags: ["更新タグ"],
          deleteAttachmentIds: [originalPayload.attachment.id],
          stagedAttachments: [stagedPayload.attachment],
        }),
      }),
      env,
    );
    expect(updated.status).toBe(200);

    const savedMemo = await db
      .prepare("SELECT * FROM memos WHERE id = ?")
      .bind("edit-memo")
      .first<{
        title: string;
        content: string;
        url: string;
        category_id: string;
        ai_generated: number;
      }>();
    expect(savedMemo).toMatchObject({
      title: "更新タイトル",
      content: "更新本文",
      url: "https://example.test/updated",
      category_id: "edit-category",
      ai_generated: 1,
    });
    expect(
      await db
        .prepare(
          "SELECT name FROM tags INNER JOIN memo_tags ON memo_tags.tag_id = tags.id WHERE memo_tags.memo_id = ?",
        )
        .bind("edit-memo")
        .first<{ name: string }>(),
    ).toEqual({ name: "更新タグ" });
    expect(
      await env.MY_MEMO_FILES.head(originalPayload.attachment.r2Key),
    ).toBeNull();
    expect(
      await env.MY_MEMO_FILES.head(stagedPayload.attachment.token),
    ).not.toBeNull();

    const forbidden = await appForUser("edit-other").fetch(
      new Request("https://example.test/api/memos/edit-memo", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "不正更新",
          content: "不正更新",
          tags: [],
          deleteAttachmentIds: [],
          stagedAttachments: [],
        }),
      }),
      env,
    );
    expect(forbidden.status).toBe(404);
  });

  it("更新の検証に失敗した場合は本体を変更せず確定前添付も削除する", async () => {
    await addUser("atomic-owner");
    await addUser("atomic-other");
    await addMemo("atomic-memo", "atomic-owner");
    await run(
      "INSERT INTO categories (id, user_id, name) VALUES (?, ?, ?)",
      "other-category",
      "atomic-other",
      "他ユーザーカテゴリ",
    );
    const ownerApp = appForUser("atomic-owner");
    const stagedResponse = await ownerApp.fetch(
      new Request(
        "https://example.test/api/memos/atomic-memo/edit-attachments",
        {
          method: "POST",
          headers: {
            "Content-Type": "text/plain",
            "X-Edit-Id": "atomic-request-1",
            "X-File-Size": "4",
            "X-File-Name": encodeURIComponent("atomic.txt"),
          },
          body: "data",
        },
      ),
      env,
    );
    const stagedPayload = (await stagedResponse.json()) as {
      attachment: {
        token: string;
        fileName: string;
        contentType: string;
        sizeBytes: number;
        etag: string;
      };
    };
    const response = await ownerApp.fetch(
      new Request("https://example.test/api/memos/atomic-memo", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "保存してはいけないタイトル",
          content: "保存してはいけない本文",
          categoryId: "other-category",
          tags: [],
          stagedAttachments: [stagedPayload.attachment],
          deleteAttachmentIds: [],
        }),
      }),
      env,
    );
    expect(response.status).toBe(400);
    const memo = await db
      .prepare("SELECT title, content FROM memos WHERE id = ?")
      .bind("atomic-memo")
      .first<{ title: string; content: string }>();
    expect(memo).toEqual({ title: "atomic-memo", content: "atomic-memo" });
    expect(
      await env.MY_MEMO_FILES.head(stagedPayload.attachment.token),
    ).toBeNull();
  });
});
