import { env } from "cloudflare:workers";
import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import memosRoute from "./index";

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
     VALUES (?, ?, ?, 1, 'user', 'free', ?, ?)`,
    id,
    id,
    `${id}@example.com`,
    now,
    now,
  );
};

const appFor = (userId?: string) => {
  const app = new Hono<{ Bindings: CloudflareBindings }>();
  app.use("*", async (c, next) => {
    c.set("user", userId ? ({ id: userId } as never) : null);
    c.set("session", null);
    await next();
  });
  app.route("/api/memos", memosRoute);
  return app;
};

const request = () =>
  new Request("https://example.test/api/memos/suggest-classification", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "TypeScriptのメモ",
      content: "WorkersでAPIを実装する",
      currentCategoryId: null,
      currentTags: [],
    }),
  });

beforeEach(async () => {
  await db.batch([
    db.prepare("DELETE FROM memo_tags"),
    db.prepare("DELETE FROM memos"),
    db.prepare("DELETE FROM categories"),
    db.prepare("DELETE FROM tags"),
    db.prepare("DELETE FROM usage_counters"),
    db.prepare("DELETE FROM user"),
    db.prepare(
      `INSERT INTO plan_limits (plan_id, metric, limit_value)
       VALUES ('free', 'ai_suggestion.monthly', 30)
       ON CONFLICT(plan_id, metric) DO UPDATE SET limit_value = 30`,
    ),
  ]);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("メモ分類サジェスト", () => {
  it.each(["work", null])(
    "タグ上限時はタグを評価せずカテゴリー%sだけを判断する",
    async (currentCategoryId) => {
      await addUser("full-tags");
      await run(
        "INSERT INTO categories (id, user_id, name) VALUES ('work', 'full-tags', '仕事')",
      );
      await run(
        "INSERT INTO tags (id, user_id, name) VALUES ('extra', 'full-tags', '追加候補')",
      );
      const runMock = vi.fn().mockResolvedValue({
        answers: {
          category: {
            type: "choice",
            choice: "work",
            probabilities: { work: 0.9, none: 0.1 },
          },
        },
      });
      const response = await appFor("full-tags").fetch(
        new Request("https://example.test/api/memos/suggest-classification", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: "仕事のメモ",
            content: "本文",
            currentCategoryId,
            currentTags: Array.from(
              { length: 10 },
              (_, index) => `選択${index}`,
            ),
          }),
        }),
        { ...env, AI: { run: runMock } } as unknown as CloudflareBindings,
      );
      if (currentCategoryId) {
        expect(response.status).toBe(400);
        expect(runMock).not.toHaveBeenCalled();
      } else {
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({
          categoryId: "work",
          tags: [],
        });
        expect(runMock).toHaveBeenCalledTimes(1);
        expect(Object.keys(runMock.mock.calls[0][1].questions)).toEqual([
          "category",
        ]);
      }
      expect(
        await db
          .prepare(
            "SELECT used FROM usage_counters WHERE user_id = 'full-tags' AND metric = 'ai_suggestion.monthly'",
          )
          .first(),
      ).toEqual({ used: currentCategoryId ? 0 : 1 });
    },
  );

  it("候補外のカテゴリー回答を拒否して利用回数を返す", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await addUser("invalid-choice");
    await run(
      "INSERT INTO categories (id, user_id, name) VALUES ('work', 'invalid-choice', '仕事')",
    );
    const response = await appFor("invalid-choice").fetch(request(), {
      ...env,
      AI: {
        run: vi.fn().mockResolvedValue({
          answers: {
            category: {
              type: "choice",
              choice: "unexpected",
              probabilities: { unexpected: 1 },
            },
          },
        }),
      },
    } as unknown as CloudflareBindings);
    expect(response.status).toBe(502);
    expect(await response.json()).not.toHaveProperty("categoryId");
    expect(
      await db
        .prepare(
          "SELECT used FROM usage_counters WHERE user_id = 'invalid-choice' AND metric = 'ai_suggestion.monthly'",
        )
        .first(),
    ).toEqual({ used: 0 });
  });

  it("未認証の呼び出しを拒否する", async () => {
    const response = await appFor().fetch(request(), env);
    expect(response.status).toBe(401);
  });

  it("本人の候補だけをClefへ渡し確率0.7以上の結果を返す", async () => {
    await addUser("owner");
    await addUser("other");
    await run(
      "INSERT INTO categories (id, user_id, name) VALUES ('work', 'owner', '仕事'), ('secret', 'other', '秘密')",
    );
    await run(
      "INSERT INTO tags (id, user_id, name) VALUES ('ts', 'owner', 'TypeScript'), ('cf', 'owner', 'Cloudflare'), ('private', 'other', '非公開')",
    );

    const runMock = vi
      .fn()
      .mockImplementation(
        async (
          _model: string,
          input: { questions: Record<string, unknown> },
        ) => {
          expect(JSON.stringify(input.questions)).not.toContain("秘密");
          expect(JSON.stringify(input.questions)).not.toContain("非公開");
          return {
            answers: {
              category: {
                type: "choice",
                choice: "work",
                confidence: 1,
                probabilities: { work: 0.8, none: 0.2 },
              },
              tag_0: { type: "noul", noul: 0.9 },
              tag_1: { type: "noul", noul: 0.69 },
            },
          };
        },
      );
    const testEnv = {
      ...env,
      AI: { run: runMock },
    } as unknown as CloudflareBindings;

    const response = await appFor("owner").fetch(request(), testEnv);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      categoryId: "work",
      tags: [{ id: "cf", name: "Cloudflare" }],
      usage: { used: 1, limit: 30 },
    });
    expect(runMock).toHaveBeenCalledExactlyOnceWith(
      "@cf/cloudflare/clef",
      expect.objectContaining({ model: "clef" }),
    );
  });

  it("Clef失敗時は予約した利用回数を返す", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await addUser("failure");
    await run(
      "INSERT INTO categories (id, user_id, name) VALUES ('work', 'failure', '仕事')",
    );
    const testEnv = {
      ...env,
      AI: { run: vi.fn().mockRejectedValue(new Error("unavailable")) },
    } as unknown as CloudflareBindings;

    const response = await appFor("failure").fetch(request(), testEnv);
    expect(response.status).toBe(502);
    expect(JSON.parse(String(log.mock.calls[0]?.[0]))).toMatchObject({
      event: "memo_classification_failed",
      errorType: "Error",
      errorMessage: "unavailable",
    });
    expect(
      await db
        .prepare(
          "SELECT used FROM usage_counters WHERE user_id = 'failure' AND metric = 'ai_suggestion.monthly'",
        )
        .first(),
    ).toEqual({ used: 0 });
  });

  it("候補を100件に絞りタグ上限まで確率順で追加する", async () => {
    await addUser("many-tags");
    await db.batch(
      Array.from({ length: 103 }, (_, index) =>
        db
          .prepare(
            "INSERT INTO tags (id, user_id, name) VALUES (?, 'many-tags', ?)",
          )
          .bind(`tag-${index}`, `候補${String(index).padStart(3, "0")}`),
      ),
    );
    const runMock = vi
      .fn()
      .mockImplementation(
        async (
          _model: string,
          input: { questions: Record<string, unknown> },
        ) => {
          expect(Object.keys(input.questions).length).toBeLessThanOrEqual(64);
          return {
            answers: Object.fromEntries(
              Object.keys(input.questions).map((key) => [
                key,
                { type: "noul", noul: 1 - Number(key.slice(4)) / 1000 },
              ]),
            ),
          };
        },
      );
    const testEnv = {
      ...env,
      AI: { run: runMock },
    } as unknown as CloudflareBindings;
    const limitedRequest = new Request(
      "https://example.test/api/memos/suggest-classification",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "候補を絞る",
          content: "本文",
          currentCategoryId: "selected",
          currentTags: Array.from({ length: 8 }, (_, index) => `選択${index}`),
        }),
      },
    );

    const response = await appFor("many-tags").fetch(limitedRequest, testEnv);
    expect(await response.json()).toMatchObject({
      candidatesLimited: true,
      usage: { used: 1, limit: 30 },
      tags: [
        { id: "tag-0", name: "候補000" },
        { id: "tag-1", name: "候補001" },
      ],
    });
    expect(runMock).toHaveBeenCalledTimes(2);
    expect(Object.keys(runMock.mock.calls[0][1].questions)).toHaveLength(64);
    expect(Object.keys(runMock.mock.calls[1][1].questions)).toHaveLength(36);
  });

  it("後続バッチの失敗時は部分的な提案を返さず利用回数を返す", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await addUser("batch-failure");
    await db.batch(
      Array.from({ length: 65 }, (_, index) =>
        db
          .prepare("INSERT INTO tags (id, user_id, name) VALUES (?, ?, ?)")
          .bind(`tag-${index}`, "batch-failure", `タグ${index}`),
      ),
    );
    const runMock = vi
      .fn()
      .mockImplementationOnce(async (_model, input) => ({
        answers: Object.fromEntries(
          Object.keys(input.questions).map((key) => [
            key,
            { type: "noul", noul: 0.9 },
          ]),
        ),
      }))
      .mockRejectedValueOnce(new Error("unavailable"));
    const response = await appFor("batch-failure").fetch(request(), {
      ...env,
      AI: { run: runMock },
    } as unknown as CloudflareBindings);
    expect(response.status).toBe(502);
    expect(await response.json()).not.toHaveProperty("tags");
    expect(runMock).toHaveBeenCalledTimes(2);
    expect(
      await db
        .prepare(
          "SELECT used FROM usage_counters WHERE user_id = 'batch-failure' AND metric = 'ai_suggestion.monthly'",
        )
        .first(),
    ).toEqual({ used: 0 });
  });

  it.each([
    { mode: undefined, limit: 30 },
    { mode: "none", limit: 30 },
    { mode: "manual", limit: 30 },
    { mode: "ai", limit: 30 },
    { mode: "ai", limit: 0 },
  ])(
    "URL要約の分類方法$mode・上限$limitに従い入力値と独立クォータを保存する",
    async ({ mode, limit }) => {
      await addUser("summary-mode");
      await run(
        "UPDATE plan_limits SET limit_value = ? WHERE plan_id = 'free' AND metric = 'ai_suggestion.monthly'",
        limit,
      );
      await run(
        "INSERT INTO categories (id, user_id, name) VALUES ('chosen', 'summary-mode', '手動カテゴリー')",
      );
      await run(
        "INSERT INTO tags (id, user_id, name) VALUES ('existing', 'summary-mode', '既存タグ'), ('suggested', 'summary-mode', 'AIタグ')",
      );
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response("<html><body>記事本文</body></html>", {
            headers: { "content-type": "text/html; charset=utf-8" },
          }),
        ),
      );
      const decision = vi
        .fn()
        .mockResolvedValue({ answers: { tag_0: { type: "noul", noul: 0.9 } } });
      const encoder = new TextEncoder();
      const testEnv = {
        ...env,
        AI: {
          toMarkdown: vi
            .fn()
            .mockResolvedValue([
              { format: "markdown", data: "title: 記事\n本文" },
            ]),
          run: vi
            .fn()
            .mockImplementation(async (model: string, input: unknown) => {
              if (model === "@cf/cloudflare/clef") return decision(input);
              return new ReadableStream({
                start(controller) {
                  controller.enqueue(
                    encoder.encode('data: {"response":"要約本文"}\n\n'),
                  );
                  controller.close();
                },
              });
            }),
        },
      } as unknown as CloudflareBindings;
      const form = new URLSearchParams({
        url: "https://example.com/article",
        category: "chosen",
        tags: '["既存タグ"]',
      });
      if (mode !== undefined) form.set("classificationMode", mode);
      const response = await appFor("summary-mode").fetch(
        new Request("https://example.test/api/memos/url", {
          method: "POST",
          headers: {
            Accept: "text/event-stream",
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: form,
        }),
        testEnv,
      );
      const body = await response.text();
      expect(body).toContain("event: complete");
      expect(
        await db
          .prepare(
            "SELECT title, content, category_id FROM memos WHERE user_id = 'summary-mode'",
          )
          .first(),
      ).toEqual({ title: "記事", content: "要約本文", category_id: "chosen" });
      const classificationRuns = mode === "ai" && limit > 0 ? 1 : 0;
      expect(decision).toHaveBeenCalledTimes(classificationRuns);
      const savedTags = await db
        .prepare(
          "SELECT t.name FROM tags t JOIN memo_tags mt ON mt.tag_id = t.id JOIN memos m ON m.id = mt.memo_id WHERE m.user_id = 'summary-mode' ORDER BY t.name",
        )
        .all<{ name: string }>();
      expect(savedTags.results.map((tag) => tag.name)).toEqual(
        classificationRuns ? ["AIタグ", "既存タグ"] : ["既存タグ"],
      );
      const usage = await db
        .prepare(
          "SELECT used FROM usage_counters WHERE user_id = 'summary-mode' AND metric = 'ai_suggestion.monthly'",
        )
        .first<{ used: number }>();
      expect(usage?.used ?? 0).toBe(classificationRuns);
      if (mode === "ai" && limit === 0)
        expect(body).toContain("AIサジェストの今月の上限");
      if (mode !== "ai")
        expect(body).not.toContain("カテゴリーとタグを判断しています");
    },
  );

  it("URL要約はClef失敗時も分類前の値で保存する", async () => {
    await addUser("summary-owner");
    await run(
      "INSERT INTO categories (id, user_id, name) VALUES ('summary-category', 'summary-owner', '記事')",
    );
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("<html><body>記事本文</body></html>", {
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
      ),
    );
    const encoder = new TextEncoder();
    const testEnv = {
      ...env,
      AI: {
        toMarkdown: vi
          .fn()
          .mockResolvedValue([
            { format: "markdown", data: "title: 記事\n本文" },
          ]),
        run: vi.fn().mockImplementation(async (model: string) => {
          if (model === "@cf/cloudflare/clef") throw new Error("unavailable");
          return new ReadableStream({
            start(controller) {
              controller.enqueue(
                encoder.encode('data: {"response":"要約本文"}\n\n'),
              );
              controller.close();
            },
          });
        }),
      },
    } as unknown as CloudflareBindings;

    const response = await appFor("summary-owner").fetch(
      new Request("https://example.test/api/memos/url", {
        method: "POST",
        headers: {
          Accept: "text/event-stream",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          url: "https://example.com/article",
          tags: "",
          classificationMode: "ai",
        }),
      }),
      testEnv,
    );
    const body = await response.text();
    expect(body).toContain("event: complete");
    expect(body).toContain("AIによるカテゴリー・タグの判断に失敗しました");
    expect(
      await db
        .prepare(
          "SELECT title, content, category_id FROM memos WHERE user_id = ?",
        )
        .bind("summary-owner")
        .first(),
    ).toEqual({ title: "記事", content: "要約本文", category_id: null });
    expect(
      await db
        .prepare(
          "SELECT used FROM usage_counters WHERE user_id = ? AND metric = 'ai_suggestion.monthly'",
        )
        .bind("summary-owner")
        .first(),
    ).toEqual({ used: 0 });
  });
});
