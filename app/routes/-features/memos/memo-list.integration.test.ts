import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import {
  getMemoList,
  getMemoListDb,
  getUsedMemoTags,
  includeSelectedMemoListTag,
} from "./memo-list";

const d1 = env.MY_MEMO_D1;

const run = (sql: string, ...values: unknown[]) =>
  d1
    .prepare(sql)
    .bind(...values)
    .run();

const addUser = (id: string) => {
  const now = Date.now();
  return run(
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

const addMemo = (
  id: string,
  userId: string,
  createdAt: string,
  options: { ai?: number; categoryId?: string; url?: string } = {},
) =>
  run(
    `INSERT INTO memos
      (id, user_id, title, content, url, category_id, ai_generated, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    userId,
    id,
    id,
    options.url ?? null,
    options.categoryId ?? null,
    options.ai ?? 0,
    createdAt,
    createdAt,
  );

beforeEach(async () => {
  await d1.batch([
    d1.prepare("DELETE FROM memo_attachments"),
    d1.prepare("DELETE FROM memo_tags"),
    d1.prepare("DELETE FROM tags"),
    d1.prepare("DELETE FROM memos"),
    d1.prepare("DELETE FROM categories"),
    d1.prepare("DELETE FROM user"),
  ]);
});

describe("メモ一覧の並べ替え・絞り込み", () => {
  it("作成時間とIDで安定して昇順・降順に並べる", async () => {
    await addUser("owner");
    await addMemo("memo-b", "owner", "2026-08-08 00:00:00");
    await addMemo("memo-a", "owner", "2026-08-08 00:00:00");
    await addMemo("memo-old", "owner", "2026-08-07 00:00:00");

    const db = getMemoListDb(env);
    expect(
      (await getMemoList(db, "owner", { sort: "desc" })).map((m) => m.id),
    ).toEqual(["memo-b", "memo-a", "memo-old"]);
    expect(
      (await getMemoList(db, "owner", { sort: "asc" })).map((m) => m.id),
    ).toEqual(["memo-old", "memo-a", "memo-b"]);
  });

  it("種類・添付・タグ・カテゴリ・所有者をAND条件で絞る", async () => {
    await addUser("owner");
    await addUser("other");
    await run(
      "INSERT INTO categories (id, user_id, name) VALUES ('category-1', 'owner', '仕事')",
    );
    await run(
      "INSERT INTO tags (id, user_id, name) VALUES ('tag-1', 'owner', '重要')",
    );
    await addMemo("ai-match", "owner", "2026-08-08 03:00:00", {
      ai: 1,
      categoryId: "category-1",
      url: "https://example.com/ai",
    });
    await addMemo("link", "owner", "2026-08-08 02:00:00", {
      categoryId: "category-1",
      url: "https://example.com/link",
    });
    await addMemo("plain", "owner", "2026-08-08 01:00:00", {
      categoryId: "category-1",
    });
    await addMemo("other-ai", "other", "2026-08-08 04:00:00", {
      ai: 1,
      url: "https://example.com/other",
    });
    await run(
      "INSERT INTO memo_tags (memo_id, tag_id) VALUES ('ai-match', 'tag-1')",
    );
    await run(
      `INSERT INTO memo_attachments
        (id, memo_id, user_id, r2_key, file_name, content_type, size_bytes, etag)
       VALUES ('attachment-1', 'ai-match', 'owner', 'test/filter', 'a.txt', 'text/plain', 1, 'etag')`,
    );

    const db = getMemoListDb(env);
    const result = await getMemoList(
      db,
      "owner",
      { sort: "desc", type: "ai", attachment: "with", tag: "tag-1" },
      "category-1",
    );
    expect(result.map((memo) => memo.id)).toEqual(["ai-match"]);
    expect(
      (await getMemoList(db, "owner", { sort: "desc", type: "link" })).map(
        (memo) => memo.id,
      ),
    ).toEqual(["link"]);
    expect(
      (await getMemoList(db, "owner", { sort: "desc", type: "normal" })).map(
        (memo) => memo.id,
      ),
    ).toEqual(["plain"]);
    expect(
      (
        await getMemoList(db, "owner", {
          sort: "desc",
          attachment: "without",
        })
      ).map((memo) => memo.id),
    ).toEqual(["link", "plain"]);
  });

  it("一覧スコープで実際に使われている自分のタグだけを返す", async () => {
    await addUser("owner");
    await addUser("other");
    await run(
      "INSERT INTO categories (id, user_id, name) VALUES ('category-1', 'owner', '仕事'), ('category-2', 'owner', '個人')",
    );
    await run(
      "INSERT INTO tags (id, user_id, name) VALUES ('tag-work', 'owner', '仕事用'), ('tag-private', 'owner', '個人用'), ('tag-unused', 'owner', '未使用'), ('tag-other', 'other', '他人')",
    );
    await addMemo("work-memo", "owner", "2026-08-08 03:00:00", {
      categoryId: "category-1",
    });
    await addMemo("private-memo", "owner", "2026-08-08 02:00:00", {
      categoryId: "category-2",
    });
    await addMemo("other-memo", "other", "2026-08-08 01:00:00");
    await run(
      "INSERT INTO memo_tags (memo_id, tag_id) VALUES ('work-memo', 'tag-work'), ('private-memo', 'tag-private'), ('other-memo', 'tag-other')",
    );

    const db = getMemoListDb(env);
    expect(await getUsedMemoTags(db, "owner")).toEqual([
      { id: "tag-private", name: "個人用" },
      { id: "tag-work", name: "仕事用" },
    ]);
    expect(await getUsedMemoTags(db, "owner", "category-1")).toEqual([
      { id: "tag-work", name: "仕事用" },
    ]);
  });

  it("選択中の所有タグは一覧スコープで未使用でも候補へ残す", () => {
    expect(
      includeSelectedMemoListTag(
        [{ id: "tag-work", name: "仕事用" }],
        [
          { id: "tag-work", name: "仕事用" },
          { id: "tag-private", name: "個人用" },
        ],
        "tag-private",
      ),
    ).toEqual([
      { id: "tag-private", name: "個人用" },
      { id: "tag-work", name: "仕事用" },
    ]);
  });
});
