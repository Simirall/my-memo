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

const postJson = (
  app: ReturnType<typeof appForUser>,
  path: string,
  body: unknown,
) =>
  app.fetch(
    new Request(`https://example.test${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
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
  it("メモ削除後は指定された一覧カテゴリーへ戻る", async () => {
    await run(
      "INSERT INTO categories (id, user_id, name) VALUES ('category', 'owner', '仕事')",
    );
    await run(
      "INSERT INTO memos (id, user_id, title, content, category_id) VALUES ('memo', 'owner', '題名', '本文', 'category')",
    );

    const response = await post(
      appForUser("owner"),
      "/api/memos/delete/memo?returnTo=%2Fcategories%2Fcategory",
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/categories/category");
  });

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

describe("タグ名の変更", () => {
  beforeEach(async () => {
    await run(
      "INSERT INTO tags (id, user_id, name) VALUES ('own-tag', 'owner', '仕事'), ('duplicate-tag', 'owner', '個人'), ('other-tag', 'other', '他人')",
    );
    await run(
      "INSERT INTO memos (id, user_id, title, content) VALUES ('tagged-memo', 'owner', 'タグ付き', '本文')",
    );
    await run(
      "INSERT INTO memo_tags (memo_id, tag_id) VALUES ('tagged-memo', 'own-tag')",
    );
  });

  it("所有するタグ名の前後空白を除いて変更し、メモとの紐付けを維持する", async () => {
    const response = await postJson(
      appForUser("owner"),
      "/api/tags/rename/own-tag",
      { name: "  更新後  " },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, name: "更新後" });
    expect(
      await first<{ name: string; tag_id: string }>(
        `SELECT tags.name, memo_tags.tag_id
         FROM tags INNER JOIN memo_tags ON memo_tags.tag_id = tags.id
         WHERE memo_tags.memo_id = 'tagged-memo'`,
      ),
    ).toEqual({ name: "更新後", tag_id: "own-tag" });
  });

  it("未認証・別所有者・存在しないタグを変更しない", async () => {
    expect(
      (
        await postJson(appForUser(null), "/api/tags/rename/own-tag", {
          name: "変更",
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await postJson(appForUser("owner"), "/api/tags/rename/other-tag", {
          name: "変更",
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await postJson(appForUser("owner"), "/api/tags/rename/missing", {
          name: "変更",
        })
      ).status,
    ).toBe(404);
    expect(
      await first<{ name: string }>(
        "SELECT name FROM tags WHERE id = 'other-tag'",
      ),
    ).toEqual({ name: "他人" });
  });

  it.each([
    ["文字列以外", 123],
    ["空白のみ", "   "],
    ["名前中の空白", "仕事 メモ"],
    ["30文字超過", "あ".repeat(31)],
  ])("%sの名前を拒否する", async (_label, name) => {
    const response = await postJson(
      appForUser("owner"),
      "/api/tags/rename/own-tag",
      { name },
    );

    expect(response.status).toBe(400);
    expect(
      await first<{ name: string }>(
        "SELECT name FROM tags WHERE id = 'own-tag'",
      ),
    ).toEqual({ name: "仕事" });
  });

  it("重複名を拒否し、同じ名前は成功として扱う", async () => {
    const duplicate = await postJson(
      appForUser("owner"),
      "/api/tags/rename/own-tag",
      { name: "個人" },
    );
    expect(duplicate.status).toBe(409);

    const unchanged = await postJson(
      appForUser("owner"),
      "/api/tags/rename/own-tag",
      { name: "仕事" },
    );
    expect(unchanged.status).toBe(200);
    expect(await unchanged.json()).toEqual({ ok: true, name: "仕事" });
  });
});

describe("カテゴリーの並べ替え", () => {
  beforeEach(async () => {
    await run(
      "INSERT INTO categories (id, user_id, name, sort_order) VALUES ('first', 'owner', '先頭', 0), ('second', 'owner', '末尾', 1), ('other-category', 'other', '他人', 0)",
    );
  });

  it("所有する全カテゴリーを受信順で保存する", async () => {
    const response = await postJson(
      appForUser("owner"),
      "/api/categories/reorder",
      {
        categoryIds: ["second", "first"],
      },
    );

    expect(response.status).toBe(200);
    const result = await db
      .prepare(
        "SELECT id, sort_order FROM categories WHERE user_id = 'owner' ORDER BY sort_order",
      )
      .all();
    expect(result.results).toEqual([
      { id: "second", sort_order: 0 },
      { id: "first", sort_order: 1 },
    ]);
  });

  it("新しいカテゴリーを現在の並びの末尾へ追加する", async () => {
    const response = await appForUser("owner").fetch(
      new Request("https://example.test/api/categories/create", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ name: "追加" }),
      }),
      env,
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "/settings/categories?created=1",
    );
    expect(
      await first<{ sort_order: number }>(
        "SELECT sort_order FROM categories WHERE user_id = 'owner' AND name = '追加'",
      ),
    ).toEqual({ sort_order: 2 });
  });

  it("未認証では並び順を更新しない", async () => {
    const response = await postJson(
      appForUser(null),
      "/api/categories/reorder",
      {
        categoryIds: ["second", "first"],
      },
    );

    expect(response.status).toBe(401);
    expect(
      await first<{ sort_order: number }>(
        "SELECT sort_order FROM categories WHERE id = 'first'",
      ),
    ).toEqual({ sort_order: 0 });
  });

  it.each([
    ["重複", ["first", "first"]],
    ["欠落", ["first"]],
    ["余分", ["first", "second", "missing"]],
    ["別所有者", ["first", "other-category"]],
  ])("%sを含むID一覧を拒否する", async (_label, categoryIds) => {
    const response = await postJson(
      appForUser("owner"),
      "/api/categories/reorder",
      {
        categoryIds,
      },
    );

    expect(response.status).toBe(400);
    expect(
      await first<{ sort_order: number }>(
        "SELECT sort_order FROM categories WHERE id = 'first'",
      ),
    ).toEqual({ sort_order: 0 });
  });
});

describe("カテゴリーの作成", () => {
  it("前後の空白を除いて登録し、空白だけの名前を拒否する", async () => {
    const app = appForUser("owner");
    const create = (name: string) =>
      app.fetch(
        new Request("https://example.test/api/categories/create", {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ name }),
        }),
        env,
      );

    expect((await create("  仕事  ")).status).toBe(302);
    expect(
      await first("SELECT id FROM categories WHERE name = '仕事'"),
    ).not.toBeNull();
    expect((await create("   ")).status).toBe(400);
  });

  it("同じ名前のカテゴリーを登録せず、重複通知へ戻す", async () => {
    await run(
      "INSERT INTO categories (id, user_id, name, sort_order) VALUES ('existing', 'owner', '仕事', 0)",
    );

    const response = await appForUser("owner").fetch(
      new Request("https://example.test/api/categories/create", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ name: "仕事" }),
      }),
      env,
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "/settings/categories?error=duplicate",
    );
    expect(
      await first<{ count: number }>(
        "SELECT COUNT(*) AS count FROM categories WHERE user_id = 'owner' AND name = '仕事'",
      ),
    ).toEqual({ count: 1 });
  });
});

describe("カテゴリー名の変更", () => {
  beforeEach(async () => {
    await run(
      "INSERT INTO categories (id, user_id, name) VALUES ('own-category', 'owner', '仕事'), ('duplicate', 'owner', '個人'), ('other-category', 'other', '他人')",
    );
  });

  it("所有するカテゴリーの名前と除外設定を変更する", async () => {
    const response = await postJson(
      appForUser("owner"),
      "/api/categories/rename/own-category",
      { name: "  新しい仕事  ", excludeFromAll: true },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      name: "新しい仕事",
      excludeFromAll: true,
    });
    expect(
      await first<{ name: string; exclude_from_all: number }>(
        "SELECT name, exclude_from_all FROM categories WHERE id = 'own-category'",
      ),
    ).toEqual({ name: "新しい仕事", exclude_from_all: 1 });
  });

  it("未認証・別所有者・存在しないカテゴリーを変更しない", async () => {
    expect(
      (
        await postJson(
          appForUser(null),
          "/api/categories/rename/own-category",
          { name: "変更", excludeFromAll: false },
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await postJson(
          appForUser("owner"),
          "/api/categories/rename/other-category",
          { name: "変更", excludeFromAll: false },
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await postJson(appForUser("owner"), "/api/categories/rename/missing", {
          name: "変更",
          excludeFromAll: false,
        })
      ).status,
    ).toBe(404);
    expect(
      await first<{ name: string }>(
        "SELECT name FROM categories WHERE id = 'other-category'",
      ),
    ).toEqual({ name: "他人" });
  });

  it.each([
    ["空白のみ", "   "],
    ["50文字超過", "あ".repeat(51)],
  ])("%sの名前を拒否する", async (_label, name) => {
    const response = await postJson(
      appForUser("owner"),
      "/api/categories/rename/own-category",
      { name, excludeFromAll: false },
    );

    expect(response.status).toBe(400);
    expect(
      await first<{ name: string }>(
        "SELECT name FROM categories WHERE id = 'own-category'",
      ),
    ).toEqual({ name: "仕事" });
  });

  it("重複名を拒否し、同じ名前は成功として扱う", async () => {
    const duplicate = await postJson(
      appForUser("owner"),
      "/api/categories/rename/own-category",
      { name: "個人", excludeFromAll: false },
    );
    expect(duplicate.status).toBe(409);

    const unchanged = await postJson(
      appForUser("owner"),
      "/api/categories/rename/own-category",
      { name: "仕事", excludeFromAll: false },
    );
    expect(unchanged.status).toBe(200);
    expect(await unchanged.json()).toEqual({
      ok: true,
      name: "仕事",
      excludeFromAll: false,
    });
  });

  it("除外設定だけを変更し、不正な値を拒否する", async () => {
    const changed = await postJson(
      appForUser("owner"),
      "/api/categories/rename/own-category",
      { name: "仕事", excludeFromAll: true },
    );
    expect(changed.status).toBe(200);
    expect(
      await first<{ exclude_from_all: number }>(
        "SELECT exclude_from_all FROM categories WHERE id = 'own-category'",
      ),
    ).toEqual({ exclude_from_all: 1 });

    const invalid = await postJson(
      appForUser("owner"),
      "/api/categories/rename/own-category",
      { name: "仕事", excludeFromAll: "true" },
    );
    expect(invalid.status).toBe(400);
  });
});
