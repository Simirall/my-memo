import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import { beforeEach, describe, expect, it } from "vitest";
import { insertMemoWithinQuota } from "@/features/access-control/quota";
import { replaceMemoTags } from "@/features/tags/data/tags";
import * as schema from "@/schema";

const db = env.MY_MEMO_D1;
const appDb = drizzle(db, { schema });

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

beforeEach(async () => {
  await db.batch([
    db.prepare("DELETE FROM memo_tags"),
    db.prepare("DELETE FROM memos"),
    db.prepare("DELETE FROM tags"),
    db.prepare("DELETE FROM user"),
    db.prepare(
      "UPDATE plan_limits SET limit_value = 100 WHERE metric = 'memo.total'",
    ),
  ]);
});

describe("タグの保存", () => {
  it("同一ユーザー内でタグを再利用し、付け外しを置き換える", async () => {
    await addUser("tag-owner");
    expect(
      await insertMemoWithinQuota(db, {
        id: "memo-a",
        userId: "tag-owner",
        title: "a",
        content: "a",
        url: null,
        categoryId: null,
        isAiSummary: 0,
        tags: ["仕事", "あとで"],
      }),
    ).toBe(true);
    expect(
      await insertMemoWithinQuota(db, {
        id: "memo-b",
        userId: "tag-owner",
        title: "b",
        content: "b",
        url: null,
        categoryId: null,
        isAiSummary: 0,
        tags: ["仕事"],
      }),
    ).toBe(true);

    const tagCount = await db
      .prepare("SELECT COUNT(*) AS count FROM tags WHERE user_id = ?")
      .bind("tag-owner")
      .first<{ count: number }>();
    expect(tagCount?.count).toBe(2);

    await replaceMemoTags(db, "memo-a", "tag-owner", ["仕事"]);
    const memoTags = await db
      .prepare(
        `SELECT t.name FROM memo_tags mt
         INNER JOIN tags t ON t.id = mt.tag_id
         WHERE mt.memo_id = ?`,
      )
      .bind("memo-a")
      .all<{ name: string }>();
    expect(memoTags.results).toEqual([{ name: "仕事" }]);
  });

  it("同名タグをユーザーごとに分離し、未使用タグを残す", async () => {
    await addUser("owner-a");
    await addUser("owner-b");
    for (const [memoId, userId] of [
      ["memo-a", "owner-a"],
      ["memo-b", "owner-b"],
    ]) {
      expect(
        await insertMemoWithinQuota(db, {
          id: memoId,
          userId,
          title: memoId,
          content: memoId,
          url: null,
          categoryId: null,
          isAiSummary: 0,
          tags: ["共通"],
        }),
      ).toBe(true);
    }

    await run("DELETE FROM memos WHERE id = ?", "memo-a");
    const tags = await db
      .prepare("SELECT user_id, name FROM tags ORDER BY user_id")
      .all<{ user_id: string; name: string }>();
    expect(tags.results).toEqual([
      { user_id: "owner-a", name: "共通" },
      { user_id: "owner-b", name: "共通" },
    ]);
  });

  it("メモとタグのリレーションを一覧取得できる", async () => {
    await addUser("relation-owner");
    await insertMemoWithinQuota(db, {
      id: "relation-memo",
      userId: "relation-owner",
      title: "relation",
      content: "relation",
      url: null,
      categoryId: null,
      isAiSummary: 0,
      tags: ["関連"],
    });

    const tag = await appDb.query.tagsTable.findFirst({
      where: (table, { eq }) => eq(table.userId, "relation-owner"),
      with: {
        memoTags: {
          with: {
            memo: { with: { memoTags: { with: { tag: true } } } },
          },
        },
      },
    });
    expect(tag?.memoTags[0]?.memo?.memoTags[0]?.tag?.name).toBe("関連");
  });
});
