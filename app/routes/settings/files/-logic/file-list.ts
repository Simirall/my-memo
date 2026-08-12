import { and, asc, desc, eq, isNull } from "drizzle-orm";
import type { getAppDb } from "@/features/access-control/authorization";
import * as schema from "@/schema";

export const FILE_LIST_PAGE_SIZE = 24;

export type FileListQuery = {
  category?: "uncategorized" | string;
  page: number;
};

export type FileListDb = ReturnType<typeof getAppDb>;

const readSingleValue = (
  searchParams: URLSearchParams,
  name: string,
): string | undefined => {
  const values = searchParams.getAll(name);
  return values.length === 1 && values[0] ? values[0] : undefined;
};

export const parseFileListQuery = (
  searchParams: URLSearchParams,
  ownedCategoryIds: ReadonlySet<string>,
): FileListQuery => {
  const categoryValue = readSingleValue(searchParams, "category");
  const pageValue = readSingleValue(searchParams, "page");
  const page =
    pageValue && /^[1-9]\d*$/.test(pageValue) ? Number(pageValue) : 1;

  return {
    category:
      categoryValue === "uncategorized" ||
      (categoryValue ? ownedCategoryIds.has(categoryValue) : false)
        ? categoryValue
        : undefined,
    page:
      Number.isSafeInteger(page) &&
      Number.isSafeInteger((page - 1) * FILE_LIST_PAGE_SIZE)
        ? page
        : 1,
  };
};

export const buildFileListUrl = (pathname: string, query: FileListQuery) => {
  const searchParams = new URLSearchParams();
  if (query.category) searchParams.set("category", query.category);
  if (query.page > 1) searchParams.set("page", String(query.page));
  const search = searchParams.toString();
  return search ? `${pathname}?${search}` : pathname;
};

export const getEmptyFileListRedirectUrl = (
  pathname: string,
  query: FileListQuery,
  itemCount: number,
) =>
  query.page > 1 && itemCount === 0
    ? buildFileListUrl(pathname, { ...query, page: 1 })
    : undefined;

export const getFileList = async (
  db: FileListDb,
  userId: string,
  query: FileListQuery,
) => {
  const conditions = [eq(schema.memoAttachmentsTable.userId, userId)];

  if (query.category === "uncategorized") {
    conditions.push(isNull(schema.memosTable.categoryId));
  } else if (query.category) {
    conditions.push(eq(schema.memosTable.categoryId, query.category));
  }

  const rows = await db
    .select({
      attachment: schema.memoAttachmentsTable,
      memo: {
        id: schema.memosTable.id,
        title: schema.memosTable.title,
        content: schema.memosTable.content,
        categoryId: schema.memosTable.categoryId,
      },
      category: {
        id: schema.categoriesTable.id,
        name: schema.categoriesTable.name,
      },
    })
    .from(schema.memoAttachmentsTable)
    .innerJoin(
      schema.memosTable,
      eq(schema.memosTable.id, schema.memoAttachmentsTable.memoId),
    )
    .leftJoin(
      schema.categoriesTable,
      eq(schema.categoriesTable.id, schema.memosTable.categoryId),
    )
    .where(and(...conditions))
    .orderBy(
      desc(schema.memoAttachmentsTable.createdAt),
      desc(schema.memoAttachmentsTable.id),
    )
    .limit(FILE_LIST_PAGE_SIZE + 1)
    .offset((query.page - 1) * FILE_LIST_PAGE_SIZE);

  return {
    items: rows.slice(0, FILE_LIST_PAGE_SIZE).map((row) => ({
      ...row.attachment,
      memo: row.memo,
      category: row.category,
    })),
    hasNextPage: rows.length > FILE_LIST_PAGE_SIZE,
  };
};

export const getFileCategories = async (db: FileListDb, userId: string) =>
  db
    .select({
      id: schema.categoriesTable.id,
      name: schema.categoriesTable.name,
    })
    .from(schema.categoriesTable)
    .where(eq(schema.categoriesTable.userId, userId))
    .orderBy(asc(schema.categoriesTable.name));

export const getMemoExcerpt = (content: string | null, maxLength = 160) => {
  if (content === null) return "";
  const plainText = content
    .replace(/<[^>]*>/g, " ")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[`*_#>~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (plainText.length <= maxLength) return plainText;
  return `${plainText.slice(0, maxLength).trimEnd()}…`;
};
