import { and, asc, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import type { MemoListQuery } from "@/features/memos/list/query/memo-list-query";
import * as schema from "@/schema";

export const getMemoListDb = (env: Cloudflare.Env) =>
  drizzle(env.MY_MEMO_D1, { schema });

type MemoListDb = ReturnType<typeof getMemoListDb>;

export const MEMO_LIST_PAGE_SIZE = 20;

export const getMemoList = async (
  db: MemoListDb,
  userId: string,
  query: MemoListQuery,
  categoryId?: string,
) => {
  const conditions = [eq(schema.memosTable.userId, userId)];

  if (categoryId) conditions.push(eq(schema.memosTable.categoryId, categoryId));

  if (query.type === "ai") {
    conditions.push(eq(schema.memosTable.isAiSummary, 1));
  } else if (query.type === "link") {
    conditions.push(eq(schema.memosTable.isAiSummary, 0));
    conditions.push(isNotNull(schema.memosTable.url));
  } else if (query.type === "normal") {
    conditions.push(eq(schema.memosTable.isAiSummary, 0));
    conditions.push(isNull(schema.memosTable.url));
  }

  if (query.attachment) {
    const exists = sql`exists (
      select 1 from memo_attachments
      where memo_attachments.memo_id = ${schema.memosTable.id}
    )`;
    conditions.push(query.attachment === "with" ? exists : sql`not ${exists}`);
  }

  if (query.tag) {
    conditions.push(sql`exists (
      select 1 from memo_tags
      where memo_tags.memo_id = ${schema.memosTable.id}
        and memo_tags.tag_id = ${query.tag}
    )`);
  }

  const order = query.sort === "asc" ? asc : desc;
  const rows = await db.query.memosTable.findMany({
    with: {
      category: true,
      memoTags: { with: { tag: true } },
      attachments: true,
    },
    where: and(...conditions),
    orderBy: [order(schema.memosTable.createdAt), order(schema.memosTable.id)],
    limit: MEMO_LIST_PAGE_SIZE + 1,
    offset: (query.page - 1) * MEMO_LIST_PAGE_SIZE,
  });

  return {
    items: rows.slice(0, MEMO_LIST_PAGE_SIZE),
    hasNextPage: rows.length > MEMO_LIST_PAGE_SIZE,
  };
};

export const getUsedMemoTags = async (
  db: MemoListDb,
  userId: string,
  categoryId?: string,
) => {
  const conditions = [
    eq(schema.tagsTable.userId, userId),
    eq(schema.memosTable.userId, userId),
  ];
  if (categoryId) {
    conditions.push(eq(schema.memosTable.categoryId, categoryId));
  }

  const tags = await db
    .selectDistinct({ id: schema.tagsTable.id, name: schema.tagsTable.name })
    .from(schema.tagsTable)
    .innerJoin(
      schema.memoTagsTable,
      eq(schema.memoTagsTable.tagId, schema.tagsTable.id),
    )
    .innerJoin(
      schema.memosTable,
      eq(schema.memosTable.id, schema.memoTagsTable.memoId),
    )
    .where(and(...conditions))
    .orderBy(asc(schema.tagsTable.name));
  return tags.sort((a, b) => a.name.localeCompare(b.name, "ja"));
};

type MemoListTag = { id: string; name: string };

export const includeSelectedMemoListTag = (
  usedTags: ReadonlyArray<MemoListTag>,
  allTags: ReadonlyArray<MemoListTag>,
  selectedTagId?: string,
) => {
  if (!selectedTagId || usedTags.some((tag) => tag.id === selectedTagId)) {
    return [...usedTags];
  }
  const selectedTag = allTags.find((tag) => tag.id === selectedTagId);
  if (!selectedTag) return [...usedTags];

  return [...usedTags, selectedTag].sort((a, b) =>
    a.name.localeCompare(b.name, "ja"),
  );
};
