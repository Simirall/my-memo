import { asc, eq } from "drizzle-orm";
import { getCookie } from "hono/cookie";
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
import { MemoListTable } from "@/features/memos/list/table/memo-list-table";
import { getTagSuggestions } from "@/features/tags/data/tags";
import CategoryTabs from "@/islands/$category-tabs";
import MemoListViewController from "@/islands/$memo-list-view-controller";
import * as schema from "@/schema";
import type { PageProps } from "@/server/request-context";
import { getRequestContext, redirect } from "@/server/request-context";

export default async function Page(props: PageProps) {
  const c = getRequestContext();
  const searchParams = new URLSearchParams(props.query);
  const user = c.get("user");
  if (!user) {
    return redirect("/login");
  }

  const db = getMemoListDb(c.env);

  const [categories, tags, usedTags, tagSuggestions] = await Promise.all([
    getUserCategories(c.env.MY_MEMO_D1, user.id),
    db
      .select({ id: schema.tagsTable.id, name: schema.tagsTable.name })
      .from(schema.tagsTable)
      .where(eq(schema.tagsTable.userId, user.id))
      .orderBy(asc(schema.tagsTable.name)),
    getUsedMemoTags(db, user.id),
    getTagSuggestions(getAppDb(c.env), user.id),
  ]);
  const query = parseMemoListQuery(
    searchParams,
    new Set(tags.map((tag) => tag.id)),
  );
  const notice = searchParams.get("notice");
  const result = await getMemoList(db, user.id, query);
  scheduleBackgroundTask(
    () => c.executionCtx,
    () =>
      maintainLinkPreviewCache(
        c.env.MY_MEMO_D1,
        result.linkPreviewUrlsToRefresh,
      ),
  );
  const emptyPageRedirect = getEmptyMemoListRedirectUrl(
    props.path,
    query,
    result.items.length,
  );
  if (emptyPageRedirect) return redirect(emptyPageRedirect);
  const filterTags = includeSelectedMemoListTag(usedTags, tags, query.tag);
  const returnTo = buildMemoListUrl(props.path, query);

  return (
    <div>
      <title>メモ一覧 | My Memo</title>
      <h1 className="sr-only">メモ一覧</h1>
      {notice && (
        <div className="alert alert-warning mb-4" role="status">
          {notice}
        </div>
      )}
      <div className="sticky top-20 z-10 w-full">
        <CategoryTabs activeCategoryId={null} categories={categories} />
      </div>
      <MemoListViewController
        cards={result.items.map((memo) => ({
          id: memo.id,
          content: (
            <Memo
              key={memo.id}
              listPath={props.path}
              memo={memo}
              query={query}
              returnTo={returnTo}
            />
          ),
        }))}
        controls={
          <MemoListControls
            action={props.path}
            initialOpen={getCookie(c, MEMO_LIST_CONTROLS_OPEN_COOKIE) === "1"}
            query={query}
            tags={filterTags}
          />
        }
        key={props.path}
        listPath={props.path}
        table={
          <MemoListTable
            items={result.items}
            listPath={props.path}
            query={query}
            returnTo={returnTo}
            showCategory
          />
        }
      />
      <MemoPagination
        hasNextPage={result.hasNextPage}
        hasPageAfterNext={result.hasPageAfterNext}
        pathname={props.path}
        query={query}
      />
      <MemoTagEditor
        activeTagId={query.tag}
        availableTags={tags}
        key={`${props.path}?${props.query ?? ""}`}
        listPath={props.path}
        query={query}
        suggestedTags={usedTags}
        tagSuggestions={tagSuggestions}
      />
      <ActionFab />
    </div>
  );
}

export const getConfig = () => ({ render: "dynamic" as const });
