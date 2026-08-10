import { env } from "cloudflare:workers";
import { Hono } from "hono";
import { beforeEach, describe, expect, it } from "vitest";
import categoriesRoute from "./categories/index";
import memosRoute from "./memos/index";
import tagsRoute from "./tags/index";

const db = env.MY_MEMO_D1;

const run = (sql: string, ...values: unknown[]) =>
  db
    .prepare(sql)
    .bind(...values)
    .run();

const first = <T>(sql: string, ...values: unknown[]) =>
  db
    .prepare(sql)
    .bind(...values)
    .first<T>();

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

const appForUser = (userId: string | null) => {
  const app = new Hono<{ Bindings: CloudflareBindings }>();
  app.use("*", async (c, next) => {
    c.set("user", userId ? ({ id: userId } as never) : null);
    c.set("session", null);
    await next();
  });
  app.route("/api/categories", categoriesRoute);
  app.route("/api/tags", tagsRoute);
  app.route("/api/memos", memosRoute);
  return app;
};

const post = (app: ReturnType<typeof appForUser>, path: string) =>
  app.fetch(
    new Request(`https://example.test${path}`, { method: "POST" }),
    env,
  );

beforeEach(async () => {
  await db.batch([
    db.prepare("DELETE FROM memo_tags"),
    db.prepare("DELETE FROM memo_attachments"),
    db.prepare("DELETE FROM memos"),
    db.prepare("DELETE FROM categories"),
    db.prepare("DELETE FROM tags"),
    db.prepare("DELETE FROM user"),
  ]);
  await addUser("owner");
  await addUser("other");
});

describe("破壊操作の所有者分離", () => {
  it("未認証ではカテゴリー・タグ・メモを削除しない", async () => {
    await run(
      "INSERT INTO categories (id, user_id, name) VALUES ('category', 'owner', '仕事')",
    );
    await run(
      "INSERT INTO tags (id, user_id, name) VALUES ('tag', 'owner', '重要')",
    );
    await run(
      "INSERT INTO memos (id, user_id, title, content, category_id) VALUES ('memo', 'owner', '題名', '本文', 'category')",
    );
    await run("INSERT INTO memo_tags (memo_id, tag_id) VALUES ('memo', 'tag')");

    const app = appForUser(null);
    for (const path of [
      "/api/categories/delete/category",
      "/api/tags/delete/tag",
      "/api/memos/delete/memo",
    ]) {
      expect((await post(app, path)).status).toBe(302);
    }

    expect(
      await first("SELECT id FROM categories WHERE id = 'category'"),
    ).not.toBeNull();
    expect(await first("SELECT id FROM tags WHERE id = 'tag'")).not.toBeNull();
    expect(
      await first("SELECT id FROM memos WHERE id = 'memo'"),
    ).not.toBeNull();
  });

  it("別所有者のカテゴリーを削除せず、自分の削除時だけメモを未分類にする", async () => {
    await run(
      "INSERT INTO categories (id, user_id, name) VALUES ('own-category', 'owner', '自分')",
    );
    await run(
      "INSERT INTO categories (id, user_id, name) VALUES ('other-category', 'other', '他人')",
    );
    await run(
      "INSERT INTO memos (id, user_id, title, content, category_id) VALUES ('own-memo', 'owner', '自分', '本文', 'own-category')",
    );

    const app = appForUser("owner");
    await post(app, "/api/categories/delete/other-category");
    expect(
      await first("SELECT id FROM categories WHERE id = 'other-category'"),
    ).not.toBeNull();

    await post(app, "/api/categories/delete/own-category");
    expect(
      await first("SELECT id FROM categories WHERE id = 'own-category'"),
    ).toBeNull();
    expect(
      await first<{ category_id: string | null }>(
        "SELECT category_id FROM memos WHERE id = 'own-memo'",
      ),
    ).toEqual({ category_id: null });
  });

  it("別所有者のタグとメモを削除せず、自分の関連だけを削除する", async () => {
    await run(
      "INSERT INTO tags (id, user_id, name) VALUES ('own-tag', 'owner', '自分')",
    );
    await run(
      "INSERT INTO tags (id, user_id, name) VALUES ('other-tag', 'other', '他人')",
    );
    await run(
      "INSERT INTO memos (id, user_id, title, content) VALUES ('own-memo', 'owner', '自分', '本文')",
    );
    await run(
      "INSERT INTO memos (id, user_id, title, content) VALUES ('other-memo', 'other', '他人', '本文')",
    );
    await run(
      "INSERT INTO memo_tags (memo_id, tag_id) VALUES ('own-memo', 'own-tag')",
    );
    await run(
      "INSERT INTO memo_tags (memo_id, tag_id) VALUES ('other-memo', 'other-tag')",
    );

    const app = appForUser("owner");
    await post(app, "/api/tags/delete/other-tag");
    await post(app, "/api/memos/delete/other-memo");
    expect(
      await first("SELECT id FROM tags WHERE id = 'other-tag'"),
    ).not.toBeNull();
    expect(
      await first("SELECT id FROM memos WHERE id = 'other-memo'"),
    ).not.toBeNull();

    await post(app, "/api/tags/delete/own-tag");
    await post(app, "/api/memos/delete/own-memo");
    expect(await first("SELECT id FROM tags WHERE id = 'own-tag'")).toBeNull();
    expect(
      await first("SELECT id FROM memos WHERE id = 'own-memo'"),
    ).toBeNull();
    expect(
      await first("SELECT memo_id FROM memo_tags WHERE memo_id = 'own-memo'"),
    ).toBeNull();
    expect(
      await first("SELECT memo_id FROM memo_tags WHERE memo_id = 'other-memo'"),
    ).not.toBeNull();
  });
});
