import { and, asc, eq } from "drizzle-orm";
import { getCookie } from "hono/cookie";
import { getAppDb } from "@/features/access-control/authorization";
import { getUserCategories } from "@/features/categories/data/categories";
import { scheduleBackgroundTask } from "@/features/link-preview/server/background-task";
import { maintainLinkPreviewCache } from "@/features/link-preview/server/link-preview-cache";
import { MEMO_LIST_CONTROLS_OPEN_COOKIE } from "@/features/memos/list/controls/memo-list-controls-state";
import {
  getMemoList,
  getMemoListDb,
  getUsedMemoTags,
} from "@/features/memos/list/memo-list";
import {
  getEmptyMemoListRedirectUrl,
  parseMemoListQuery,
} from "@/features/memos/list/query/memo-list-query";
import { getTagSuggestions } from "@/features/tags/data/tags";
import type { Tag, TagSuggestions } from "@/features/tags/model/tags";
import * as schema from "@/schema";
import type { getRequestContext } from "@/server/request-context";
import type { MemoListQuery } from "./query/memo-list-query";

type RequestContext = ReturnType<typeof getRequestContext>;
type MemoListResult = Awaited<ReturnType<typeof getMemoList>>;

type MemoListCategory = {
  id: string;
  name: string;
};

export type MemoListPageData = {
  path: string;
  queryString?: string;
  categories: ReadonlyArray<MemoListCategory>;
  tags: ReadonlyArray<Tag>;
  usedTags: ReadonlyArray<Tag>;
  tagSuggestions: TagSuggestions;
  query: MemoListQuery;
  result: MemoListResult;
  notice: string | null;
  emptyPageRedirect?: string;
  initialControlsOpen: boolean;
  category: MemoListCategory | null;
};

type MemoListPageLoaderInput = {
  c: RequestContext;
  path: string;
  queryString?: string;
  userId: string;
};

export function loadMemoListPageData(
  input: MemoListPageLoaderInput & { categoryId: string },
): Promise<MemoListPageData | null>;
export function loadMemoListPageData(
  input: MemoListPageLoaderInput,
): Promise<MemoListPageData>;
export async function loadMemoListPageData({
  c,
  path,
  queryString,
  userId,
  categoryId,
}: MemoListPageLoaderInput & {
  categoryId?: string;
}): Promise<MemoListPageData | null> {
  const db = getMemoListDb(c.env);
  const category =
    categoryId === undefined
      ? null
      : await db.query.categoriesTable.findFirst({
          where: and(
            eq(schema.categoriesTable.userId, userId),
            eq(schema.categoriesTable.id, categoryId),
          ),
        });

  if (categoryId !== undefined && !category) return null;

  const searchParams = new URLSearchParams(queryString);
  const [categories, { tags, query, result }, usedTags, tagSuggestions] =
    await Promise.all([
      getUserCategories(c.env.MY_MEMO_D1, userId),
      db
        .select({ id: schema.tagsTable.id, name: schema.tagsTable.name })
        .from(schema.tagsTable)
        .where(eq(schema.tagsTable.userId, userId))
        .orderBy(asc(schema.tagsTable.name))
        .then(async (tags) => {
          const query = parseMemoListQuery(
            searchParams,
            new Set(tags.map((tag) => tag.id)),
          );
          const result = await getMemoList(db, userId, query, category?.id);
          return { tags, query, result };
        }),
      getUsedMemoTags(db, userId, category?.id),
      getTagSuggestions(getAppDb(c.env), userId),
    ]);
  const notice = searchParams.get("notice");
  scheduleBackgroundTask(
    () => c.executionCtx,
    () =>
      maintainLinkPreviewCache(
        c.env.MY_MEMO_D1,
        result.linkPreviewUrlsToRefresh,
      ),
  );

  return {
    path,
    queryString,
    categories,
    tags,
    usedTags,
    tagSuggestions,
    query,
    result,
    notice,
    emptyPageRedirect: getEmptyMemoListRedirectUrl(
      path,
      query,
      result.items.length,
    ),
    initialControlsOpen: getCookie(c, MEMO_LIST_CONTROLS_OPEN_COOKIE) === "1",
    category: category ? { id: category.id, name: category.name } : null,
  };
}
