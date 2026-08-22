import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { getAppDb } from "@/features/access-control/authorization";
import { getTagSuggestions } from "@/features/tags/data/tags";
import {
  getMemoList,
  getMemoListDb,
  getUsedMemoTags,
  includeSelectedMemoListTag,
  MEMO_LIST_PAGE_SIZE,
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
      (id, user_id, title, content, url, category_id, is_ai_summary, created_at, updated_at)
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

const memoIds = (result: Awaited<ReturnType<typeof getMemoList>>) =>
  result.items.map((memo) => memo.id);

beforeEach(async () => {
  await d1.batch([
    d1.prepare("DELETE FROM link_preview_cache"),
    d1.prepare("DELETE FROM memo_attachments"),
    d1.prepare("DELETE FROM memo_tags"),
    d1.prepare("DELETE FROM tags"),
    d1.prepare("DELETE FROM memos"),
    d1.prepare("DELETE FROM categories"),
    d1.prepare("DELETE FROM user"),
  ]);
});

describe("メモ一覧の並べ替え・絞り込み", () => {
  it("関連URLに対応する利用可能なOGPメタデータを付加する", async () => {
    await addUser("owner");
    await addMemo("link", "owner", "2026-08-08 00:00:00", {
      url: "https://EXAMPLE.com:443/article#top",
    });
    await run(
      `INSERT INTO link_preview_cache
        (normalized_url, title, description, image_url, card_type, status, expires_at, last_referenced_at)
       VALUES (?, ?, ?, ?, 'summary', 'ready', ?, ?)`,
      "https://example.com/article",
      "OGPタイトル",
      "OGP説明",
      "https://images.example.com/card.jpg",
      "2027-08-20T00:00:00.000Z",
      "2026-08-01T00:00:00.000Z",
    );

    const result = await getMemoList(getMemoListDb(env), "owner", {
      sort: "desc",
      page: 1,
    });

    expect(result.items[0]?.linkPreview).toEqual({
      normalizedUrl: "https://example.com/article",
      title: "OGPタイトル",
      description: "OGP説明",
      imageUrl: "https://images.example.com/card.jpg",
      cardType: "summary",
    });
    expect(result.linkPreviewUrlsToRefresh).toEqual([]);
  });

  it("作成時間とIDで安定して昇順・降順に並べる", async () => {
    await addUser("owner");
    await addMemo("memo-b", "owner", "2026-08-08 00:00:00");
    await addMemo("memo-a", "owner", "2026-08-08 00:00:00");
    await addMemo("memo-old", "owner", "2026-08-07 00:00:00");

    const db = getMemoListDb(env);
    expect(
      memoIds(await getMemoList(db, "owner", { sort: "desc", page: 1 })),
    ).toEqual(["memo-b", "memo-a", "memo-old"]);
    expect(
      memoIds(await getMemoList(db, "owner", { sort: "asc", page: 1 })),
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
      {
        sort: "desc",
        page: 1,
        type: "ai",
        attachment: "with",
        tag: "tag-1",
      },
      "category-1",
    );
    expect(memoIds(result)).toEqual(["ai-match"]);
    expect(
      memoIds(
        await getMemoList(db, "owner", {
          sort: "desc",
          page: 1,
          type: "link",
        }),
      ),
    ).toEqual(["link"]);
    expect(
      memoIds(
        await getMemoList(db, "owner", {
          sort: "desc",
          page: 1,
          type: "normal",
        }),
      ),
    ).toEqual(["plain"]);
    expect(
      memoIds(
        await getMemoList(db, "owner", {
          sort: "desc",
          page: 1,
          attachment: "without",
        }),
      ),
    ).toEqual(["link", "plain"]);
  });

  it("すべてでは除外カテゴリーを省き、カテゴリー別では表示する", async () => {
    await addUser("owner");
    await run(
      "INSERT INTO categories (id, user_id, name, exclude_from_all) VALUES ('visible', 'owner', '表示', 0), ('hidden', 'owner', '非表示', 1)",
    );
    await run(
      "INSERT INTO tags (id, user_id, name) VALUES ('hidden-tag', 'owner', '非表示用')",
    );
    await addMemo("visible-memo", "owner", "2026-08-08 03:00:00", {
      categoryId: "visible",
    });
    await addMemo("hidden-memo", "owner", "2026-08-08 02:00:00", {
      ai: 1,
      categoryId: "hidden",
      url: "https://example.com/hidden",
    });
    await addMemo("uncategorized", "owner", "2026-08-08 01:00:00");
    await run(
      "INSERT INTO memo_tags (memo_id, tag_id) VALUES ('hidden-memo', 'hidden-tag')",
    );
    await run(
      `INSERT INTO memo_attachments
        (id, memo_id, user_id, r2_key, file_name, content_type, size_bytes, etag)
       VALUES ('hidden-attachment', 'hidden-memo', 'owner', 'test/hidden', 'a.txt', 'text/plain', 1, 'etag')`,
    );

    const db = getMemoListDb(env);
    expect(
      memoIds(await getMemoList(db, "owner", { sort: "desc", page: 1 })),
    ).toEqual(["visible-memo", "uncategorized"]);
    expect(
      memoIds(
        await getMemoList(
          db,
          "owner",
          {
            sort: "desc",
            page: 1,
            type: "ai",
            attachment: "with",
            tag: "hidden-tag",
          },
          "hidden",
        ),
      ),
    ).toEqual(["hidden-memo"]);
    expect(
      memoIds(
        await getMemoList(db, "owner", {
          sort: "desc",
          page: 1,
          type: "ai",
          attachment: "with",
          tag: "hidden-tag",
        }),
      ),
    ).toEqual([]);
  });
  it("20件と40件の境界で後続ページの有無を判定する", async () => {
    await addUser("owner");
    for (let index = 1; index <= MEMO_LIST_PAGE_SIZE * 2 + 1; index += 1) {
      await addMemo(
        `memo-${String(index).padStart(2, "0")}`,
        "owner",
        `2026-08-08 00:00:${String(index).padStart(2, "0")}`,
      );
    }

    const db = getMemoListDb(env);
    const query = {
      sort: "asc",
      page: 1,
    } as const;
    const fortyOneItems = await getMemoList(db, "owner", query);

    expect(fortyOneItems.items).toHaveLength(MEMO_LIST_PAGE_SIZE);
    expect(fortyOneItems.hasNextPage).toBe(true);
    expect(fortyOneItems.hasPageAfterNext).toBe(true);

    await run("DELETE FROM memos WHERE id = 'memo-41'");
    const fortyItems = await getMemoList(db, "owner", query);
    expect(fortyItems.hasNextPage).toBe(true);
    expect(fortyItems.hasPageAfterNext).toBe(false);

    await run("DELETE FROM memos WHERE id > 'memo-21'");
    const twentyOneItems = await getMemoList(db, "owner", query);
    expect(twentyOneItems.hasNextPage).toBe(true);
    expect(twentyOneItems.hasPageAfterNext).toBe(false);

    await run("DELETE FROM memos WHERE id = 'memo-21'");
    const twentyItems = await getMemoList(db, "owner", query);
    expect(twentyItems.hasNextPage).toBe(false);
    expect(twentyItems.hasPageAfterNext).toBe(false);
  });

  it("一覧スコープで実際に使われている自分のタグだけを返す", async () => {
    await addUser("owner");
    await addUser("other");
    await run(
      "INSERT INTO categories (id, user_id, name, exclude_from_all) VALUES ('category-1', 'owner', '仕事', 0), ('category-2', 'owner', '個人', 1)",
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
      { id: "tag-work", name: "仕事用" },
    ]);
    expect(await getUsedMemoTags(db, "owner", "category-1")).toEqual([
      { id: "tag-work", name: "仕事用" },
    ]);
    expect(await getUsedMemoTags(db, "owner", "category-2")).toEqual([
      { id: "tag-private", name: "個人用" },
    ]);
    expect(await getTagSuggestions(getAppDb(env), "owner")).toEqual({
      all: [
        { id: "tag-private", name: "個人用" },
        { id: "tag-work", name: "仕事用" },
      ],
      byCategory: {
        "category-1": [{ id: "tag-work", name: "仕事用" }],
        "category-2": [{ id: "tag-private", name: "個人用" }],
      },
    });
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
