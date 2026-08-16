import { and, asc, eq } from "drizzle-orm";
import { getCookie } from "hono/cookie";
import { createRoute } from "honox/factory";
import { getAppDb } from "@/features/access-control/authorization";
import { getUserCategories } from "@/features/categories/data/categories";
import { scheduleBackgroundTask } from "@/features/link-preview/server/background-task";
import { maintainLinkPreviewCache } from "@/features/link-preview/server/link-preview-cache";
import { Memo } from "@/features/memos/list/card/memo";
import { ActionFab } from "@/features/memos/list/controls/$action-fab";
import MemoListControls from "@/features/memos/list/controls/$memo-list-controls";
import MemoTagEditor from "@/features/memos/list/controls/$memo-tag-editor";
import { MEMO_LIST_CONTROLS_OPEN_COOKIE } from "@/features/memos/list/controls/memo-list-controls-state";
import {
  getMemoList,
  getMemoListDb,
  getUsedMemoTags,
  includeSelectedMemoListTag,
} from "@/features/memos/list/memo-list";
import { MemoPagination } from "@/features/memos/list/memo-pagination";
import {
  buildMemoListUrl,
  getEmptyMemoListRedirectUrl,
  parseMemoListQuery,
} from "@/features/memos/list/query/memo-list-query";
import { getTagSuggestions } from "@/features/tags/data/tags";
import CategoryTabs from "@/islands/$category-tabs";
import * as schema from "@/schema";

export default createRoute(async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.redirect("/login");
  }

  const db = getMemoListDb(c.env);
  const id = c.req.param("id") ?? "";

  const [categories, tags, usedTags, tagSuggestions, result] =
    await Promise.all([
      getUserCategories(c.env.MY_MEMO_D1, user.id),
      db
        .select({ id: schema.tagsTable.id, name: schema.tagsTable.name })
        .from(schema.tagsTable)
        .where(eq(schema.tagsTable.userId, user.id))
        .orderBy(asc(schema.tagsTable.name)),
      getUsedMemoTags(db, user.id, id),
      getTagSuggestions(getAppDb(c.env), user.id),
      db.query.categoriesTable.findFirst({
        where: and(
          eq(schema.categoriesTable.userId, user.id),
          eq(schema.categoriesTable.id, id),
        ),
      }),
    ]);

  if (!result) {
    c.status(404);
    return c.render(
      <div className="p-4 text-center">
        <title>カテゴリーが見つかりません | My Memo</title>
        カテゴリーが見つかりません。
      </div>,
    );
  }
  const query = parseMemoListQuery(
    new URL(c.req.url).searchParams,
    new Set(tags.map((tag) => tag.id)),
  );
  const memos = await getMemoList(db, user.id, query, result.id);
  scheduleBackgroundTask(
    () => c.executionCtx,
    () =>
      maintainLinkPreviewCache(
        c.env.MY_MEMO_D1,
        memos.linkPreviewUrlsToRefresh,
      ),
  );
  const emptyPageRedirect = getEmptyMemoListRedirectUrl(
    c.req.path,
    query,
    memos.items.length,
  );
  if (emptyPageRedirect) return c.redirect(emptyPageRedirect);
  const filterTags = includeSelectedMemoListTag(usedTags, tags, query.tag);
  const returnTo = buildMemoListUrl(c.req.path, query);

  return c.render(
    <div>
      <title>{result.name} | My Memo</title>
      <h1 className="sr-only">{result.name}</h1>
      <div className="sticky top-20 z-10 w-full [&>honox-island]:block [&>honox-island]:w-full">
        <CategoryTabs activeCategoryId={result.id} categories={categories} />
      </div>
      <div className="mt-4 [&>honox-island]:block [&>honox-island]:w-full">
        <MemoListControls
          action={c.req.path}
          initialOpen={getCookie(c, MEMO_LIST_CONTROLS_OPEN_COOKIE) === "1"}
          query={query}
          tags={filterTags}
        />
      </div>
      <div
        className="grid w-full auto-rows-auto grid-cols-[repeat(auto-fit,minmax(min(100%,30rem),30rem))] items-stretch justify-center gap-4 py-4"
        data-memo-list-grid
      >
        {memos.items.map((memo) => (
          <Memo
            key={memo.id}
            listPath={c.req.path}
            memo={memo}
            query={query}
            returnTo={returnTo}
            showCategory={false}
          />
        ))}
      </div>
      {memos.items.length === 0 && (
        <p
          className="rounded-box bg-base-200 p-6 text-center text-base-content/70"
          data-memo-list-empty
        >
          条件に一致するメモはありません。
        </p>
      )}
      <MemoPagination
        hasNextPage={memos.hasNextPage}
        hasPageAfterNext={memos.hasPageAfterNext}
        pathname={c.req.path}
        query={query}
      />
      <MemoTagEditor
        activeTagId={query.tag}
        availableTags={tags}
        listPath={c.req.path}
        query={query}
        suggestedTags={usedTags}
        tagSuggestions={tagSuggestions}
      />
      <ActionFab categoryId={result.id} />
    </div>,
  );
});
