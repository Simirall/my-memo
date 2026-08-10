import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { getAppDb } from "@/features/access-control/authorization";
import {
  buildFileListUrl,
  FILE_LIST_PAGE_SIZE,
  getFileList,
  getMemoExcerpt,
  parseFileListQuery,
} from "./file-list";

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
  categoryId: string | null = null,
) =>
  run(
    `INSERT INTO memos
      (id, user_id, title, content, url, category_id, is_ai_summary, created_at, updated_at)
     VALUES (?, ?, ?, ?, NULL, ?, 0, ?, ?)`,
    id,
    userId,
    `メモ ${id}`,
    `本文 ${id}`,
    categoryId,
    createdAt,
    createdAt,
  );

const addAttachment = (
  id: string,
  memoId: string,
  userId: string,
  createdAt: string,
  contentType = "image/png",
) =>
  run(
    `INSERT INTO memo_attachments
      (id, memo_id, user_id, r2_key, file_name, content_type, size_bytes, etag, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 10, ?, ?)`,
    id,
    memoId,
    userId,
    `test/${id}`,
    `${id}.png`,
    contentType,
    `etag-${id}`,
    createdAt,
  );

beforeEach(async () => {
  await d1.batch([
    d1.prepare("DELETE FROM memo_attachments"),
    d1.prepare("DELETE FROM memos"),
    d1.prepare("DELETE FROM categories"),
    d1.prepare("DELETE FROM user"),
  ]);
});

describe("ファイル一覧URL条件", () => {
  it("カテゴリとページを解析し、不正な値を既定値へ戻す", () => {
    const ownedCategoryIds = new Set(["category-1"]);

    expect(
      parseFileListQuery(
        new URLSearchParams("category=category-1&page=2"),
        ownedCategoryIds,
      ),
    ).toEqual({ category: "category-1", page: 2 });
    expect(
      parseFileListQuery(
        new URLSearchParams("category=uncategorized"),
        ownedCategoryIds,
      ),
    ).toEqual({ category: "uncategorized", page: 1 });
    expect(
      parseFileListQuery(
        new URLSearchParams("category=other&page=0"),
        ownedCategoryIds,
      ),
    ).toEqual({ category: undefined, page: 1 });
    expect(
      buildFileListUrl("/settings/files", {
        category: "category-1",
        page: 2,
      }),
    ).toBe("/settings/files?category=category-1&page=2");
  });
});

describe("ファイル一覧取得", () => {
  it("所有者・カテゴリ・未分類を分離して新しい順に返す", async () => {
    await addUser("owner");
    await addUser("other");
    await run(
      "INSERT INTO categories (id, user_id, name) VALUES ('category-work', 'owner', '仕事')",
    );
    await addMemo("work-memo", "owner", "2026-08-08 03:00:00", "category-work");
    await addMemo("uncategorized-memo", "owner", "2026-08-08 02:00:00");
    await addMemo("other-memo", "other", "2026-08-08 04:00:00");
    await addAttachment(
      "work-file",
      "work-memo",
      "owner",
      "2026-08-08 03:00:00",
    );
    await addAttachment(
      "uncategorized-file",
      "uncategorized-memo",
      "owner",
      "2026-08-08 02:00:00",
    );
    await addAttachment(
      "other-file",
      "other-memo",
      "other",
      "2026-08-08 04:00:00",
    );

    const db = getAppDb(env);
    expect(
      (await getFileList(db, "owner", { page: 1 })).items.map(
        (item) => item.id,
      ),
    ).toEqual(["work-file", "uncategorized-file"]);
    expect(
      (
        await getFileList(db, "owner", { category: "category-work", page: 1 })
      ).items.map((item) => item.id),
    ).toEqual(["work-file"]);
    expect(
      (
        await getFileList(db, "owner", { category: "uncategorized", page: 1 })
      ).items.map((item) => item.id),
    ).toEqual(["uncategorized-file"]);
    expect(
      (await getFileList(db, "owner", { page: 1 })).items[0]?.memo.title,
    ).toBe("メモ work-memo");
  });

  it("24件境界で次ページを返す", async () => {
    await addUser("owner");
    for (let index = 1; index <= FILE_LIST_PAGE_SIZE + 1; index += 1) {
      const id = `memo-${String(index).padStart(2, "0")}`;
      const createdAt = `2026-08-08 00:00:${String(index).padStart(2, "0")}`;
      await addMemo(id, "owner", createdAt);
      await addAttachment(
        `file-${String(index).padStart(2, "0")}`,
        id,
        "owner",
        createdAt,
      );
    }

    const db = getAppDb(env);
    const firstPage = await getFileList(db, "owner", { page: 1 });
    const secondPage = await getFileList(db, "owner", { page: 2 });

    expect(firstPage.items).toHaveLength(FILE_LIST_PAGE_SIZE);
    expect(firstPage.hasNextPage).toBe(true);
    expect(secondPage.items.map((item) => item.id)).toEqual(["file-01"]);
    expect(secondPage.hasNextPage).toBe(false);
  });

  it("本文抜粋ではHTMLとMarkdown記法を実行せず省略する", () => {
    expect(
      getMemoExcerpt(
        "<script>alert(1)</script> **本文** [リンク](https://example.com)",
      ),
    ).toBe("alert(1) 本文 リンク");
    expect(getMemoExcerpt("あ".repeat(161), 160)).toHaveLength(161);
  });
});
