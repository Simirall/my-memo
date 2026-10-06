import { env } from "cloudflare:workers";
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { insertMemoWithinQuota } from "@/features/access-control/quota";
import { refreshLinkPreviewCache } from "@/features/link-preview/server/link-preview-cache";
import bulkRoute from "./-routes/bulk";

vi.mock("@/features/link-preview/server/link-preview-cache", () => ({
  refreshLinkPreviewCache: vi.fn().mockResolvedValue(true),
}));
const db = env.MY_MEMO_D1;
const run = (sql: string, ...values: unknown[]) =>
  db
    .prepare(sql)
    .bind(...values)
    .run();
const appFor = (userId?: string) => {
  const app = new Hono<{ Bindings: CloudflareBindings }>();
  app.use("*", async (c, next) => {
    c.set("user", userId ? ({ id: userId } as never) : null);
    c.set("session", null);
    await next();
  });
  app.route("/api/memos", bulkRoute);
  return app;
};
const input = {
  title: "移行メモ",
  content: "本文",
  url: null,
  categoryId: "category-owner",
  tags: ["既存", "新規"],
};
const send = (
  id: string,
  body: unknown = input,
  userId: string | undefined = "owner",
) =>
  appFor(userId).fetch(
    new Request(`https://example.test/api/memos/bulk/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    env,
    {
      waitUntil: () => {},
      passThroughOnException: () => {},
      props: {},
    },
  );
const memoCount = () =>
  db.prepare("SELECT COUNT(*) AS count FROM memos").first<{ count: number }>();

beforeEach(async () => {
  vi.clearAllMocks();
  await db.batch([
    db.prepare("DELETE FROM memo_tags"),
    db.prepare("DELETE FROM memos"),
    db.prepare("DELETE FROM categories"),
    db.prepare("DELETE FROM tags"),
    db.prepare("DELETE FROM user"),
    db.prepare(
      "UPDATE plan_limits SET limit_value=100 WHERE plan_id='free' AND metric='memo.total'",
    ),
  ]);
  for (const id of ["owner", "other"]) {
    await run(
      "INSERT INTO user (id,name,email,email_verified,role,plan_id,created_at,updated_at) VALUES (?,?,?,1,'user','free',?,?)",
      id,
      id,
      `${id}@example.com`,
      Date.now(),
      Date.now(),
    );
    await run(
      "INSERT INTO categories (id,user_id,name) VALUES (?,?,?)",
      `category-${id}`,
      id,
      "カテゴリー",
    );
    await run(
      "INSERT INTO tags (id,user_id,name) VALUES (?,?,?)",
      `tag-${id}`,
      id,
      "既存",
    );
  }
});

describe("メモの一括保存", () => {
  it("本人のカテゴリーと既存・新規タグを保存し、別所有者のタグを使わない", async () => {
    const id = crypto.randomUUID();
    const response = await send(id, {
      ...input,
      url: "https://example.com/article",
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ memoId: id });
    expect(
      await db
        .prepare(
          "SELECT user_id,title,content,url,category_id,is_ai_summary FROM memos WHERE id=?",
        )
        .bind(id)
        .first(),
    ).toEqual({
      user_id: "owner",
      title: input.title,
      content: input.content,
      url: "https://example.com/article",
      category_id: input.categoryId,
      is_ai_summary: 0,
    });
    expect(
      (
        await db
          .prepare(
            "SELECT t.user_id,t.name FROM tags t JOIN memo_tags mt ON mt.tag_id=t.id WHERE mt.memo_id=? ORDER BY t.name",
          )
          .bind(id)
          .all()
      ).results,
    ).toEqual([
      { user_id: "owner", name: "新規" },
      { user_id: "owner", name: "既存" },
    ]);
    expect(refreshLinkPreviewCache).toHaveBeenCalledOnce();
  });

  it("未認証・他人のカテゴリー・他人のメモIDを拒否する", async () => {
    const id = crypto.randomUUID();
    expect(
      (
        await appFor().fetch(
          new Request(`https://example.test/api/memos/bulk/${id}`, {
            method: "PUT",
            body: JSON.stringify(input),
          }),
          env,
        )
      ).status,
    ).toBe(401);
    expect(
      (await send(id, { ...input, categoryId: "category-other" })).status,
    ).toBe(400);
    expect(await memoCount()).toEqual({ count: 0 });
    expect((await send(id)).status).toBe(200);
    expect(
      (await send(id, { ...input, categoryId: "category-other" }, "other"))
        .status,
    ).toBe(409);
    expect(
      await db
        .prepare("SELECT user_id,title FROM memos WHERE id=?")
        .bind(id)
        .first(),
    ).toEqual({ user_id: "owner", title: input.title });
  });

  it("同じIDの再送は内容・タグを更新せず、上限到達後も成功を返す", async () => {
    const id = crypto.randomUUID();
    expect((await send(id)).status).toBe(200);
    await run(
      "UPDATE plan_limits SET limit_value=1 WHERE plan_id='free' AND metric='memo.total'",
    );
    expect(
      (await send(id, { ...input, title: "上書き", tags: ["置換"] })).status,
    ).toBe(200);
    expect((await send(crypto.randomUUID())).status).toBe(403);
    expect(await memoCount()).toEqual({ count: 1 });
    expect(
      await db.prepare("SELECT title FROM memos WHERE id=?").bind(id).first(),
    ).toEqual({ title: input.title });
    expect(
      await db
        .prepare("SELECT COUNT(*) AS count FROM tags WHERE name='置換'")
        .first(),
    ).toEqual({ count: 0 });
  });

  it("同じIDの同時送信は両方成功し、1件だけ保存する", async () => {
    const id = crypto.randomUUID();
    await run(
      "UPDATE plan_limits SET limit_value=1 WHERE plan_id='free' AND metric='memo.total'",
    );
    const results = await Promise.all([
      send(id, { ...input, title: "タグA", tags: ["タグA"] }),
      send(id, { ...input, title: "タグB", tags: ["タグB"] }),
    ]);
    expect(results.map((response) => response.status)).toEqual([200, 200]);
    expect(await memoCount()).toEqual({ count: 1 });
    const memo = await db
      .prepare("SELECT title FROM memos WHERE id=?")
      .bind(id)
      .first<{ title: string }>();
    const persisted = await db
      .prepare(
        "SELECT t.name FROM tags t JOIN memo_tags mt ON mt.tag_id=t.id WHERE mt.memo_id=?",
      )
      .bind(id)
      .all();
    expect(persisted.results).toEqual([{ name: memo?.title }]);
    expect(
      await db
        .prepare(
          "SELECT COUNT(*) AS count FROM tags WHERE name IN ('タグA','タグB')",
        )
        .first(),
    ).toEqual({ count: 1 });
  });

  it("既存IDは上限到達後も保存バッチを中断し、別のタグを書き込まない", async () => {
    const id = crypto.randomUUID();
    expect((await send(id)).status).toBe(200);
    await run(
      "UPDATE plan_limits SET limit_value=1 WHERE plan_id='free' AND metric='memo.total'",
    );
    await expect(
      insertMemoWithinQuota(db, {
        id,
        userId: "owner",
        title: "置換",
        content: null,
        url: null,
        categoryId: null,
        isAiSummary: 0,
        tags: ["競合タグ"],
      }),
    ).rejects.toThrow();
    expect(
      await db.prepare("SELECT title FROM memos WHERE id=?").bind(id).first(),
    ).toEqual({ title: input.title });
    expect(
      await db
        .prepare("SELECT COUNT(*) AS count FROM tags WHERE name='競合タグ'")
        .first(),
    ).toEqual({ count: 0 });
  });

  it("存在しないカテゴリーの拒否では未保存を明示する", async () => {
    const id = crypto.randomUUID();
    const response = await send(id, { ...input, categoryId: "deleted" });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ saved: false });
    expect(await memoCount()).toEqual({ count: 0 });
  });

  it("残り1枠へ異なるIDを同時送信しても上限を超えず、失敗行のタグを残さない", async () => {
    await run(
      "UPDATE plan_limits SET limit_value=1 WHERE plan_id='free' AND metric='memo.total'",
    );
    const results = await Promise.all([
      send(crypto.randomUUID(), { ...input, tags: ["タグA"] }),
      send(crypto.randomUUID(), { ...input, tags: ["タグB"] }),
    ]);
    expect(results.map((response) => response.status).sort()).toEqual([
      200, 403,
    ]);
    expect(await memoCount()).toEqual({ count: 1 });
    expect(
      await db
        .prepare(
          "SELECT COUNT(*) AS count FROM tags WHERE name IN ('タグA','タグB')",
        )
        .first(),
    ).toEqual({ count: 1 });
  });

  it.each([
    { title: " " },
    { title: "a".repeat(256) },
    { content: "a".repeat(10001) },
    { url: "javascript:alert(1)" },
    { url: `https://example.com/${"a".repeat(2048)}` },
    { tags: Array.from({ length: 11 }, (_, i) => `タグ${i}`) },
    { tags: ["a".repeat(31)] },
  ])("不正入力を保存しない: %j", async (patch) => {
    expect(
      (await send(crypto.randomUUID(), { ...input, ...patch })).status,
    ).toBe(400);
    expect(await memoCount()).toEqual({ count: 0 });
  });

  it("64KiBを超える入力・不正JSON・不正IDを拒否する", async () => {
    expect(
      (
        await send(crypto.randomUUID(), {
          ...input,
          content: "a".repeat(65536),
        })
      ).status,
    ).toBe(413);
    expect(
      (
        await appFor("owner").fetch(
          new Request(
            `https://example.test/api/memos/bulk/${crypto.randomUUID()}`,
            { method: "PUT", body: "{" },
          ),
          env,
        )
      ).status,
    ).toBe(400);
    expect((await send("invalid")).status).toBe(400);
    expect(await memoCount()).toEqual({ count: 0 });
  });

  it("最大10タグを付けた30件を個別保存できる", async () => {
    const tags = Array.from({ length: 10 }, (_, index) => `タグ${index}`);
    for (let index = 0; index < 30; index++)
      expect((await send(crypto.randomUUID(), { ...input, tags })).status).toBe(
        200,
      );
    expect(await memoCount()).toEqual({ count: 30 });
    expect(
      await db.prepare("SELECT COUNT(*) AS count FROM memo_tags").first(),
    ).toEqual({ count: 300 });
  });
});
