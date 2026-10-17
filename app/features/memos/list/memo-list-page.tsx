import { Memo } from "@/features/memos/list/card/memo";
import { ActionFab } from "@/features/memos/list/controls/$action-fab";
import MemoListControls from "@/features/memos/list/controls/$memo-list-controls";
import MemoTagEditor from "@/features/memos/list/controls/$memo-tag-editor";
import { includeSelectedMemoListTag } from "@/features/memos/list/memo-list";
import { MemoPagination } from "@/features/memos/list/memo-pagination";
import { buildMemoListUrl } from "@/features/memos/list/query/memo-list-query";
import { MemoListTable } from "@/features/memos/list/table/memo-list-table";
import CategoryTabs from "@/islands/$category-tabs";
import MemoListViewController from "@/islands/$memo-list-view-controller";
import type { MemoListPageData } from "./memo-list-page-data";

export function MemoListPage({
  path,
  queryString,
  categories,
  tags,
  usedTags,
  tagSuggestions,
  query,
  result,
  notice,
  initialControlsOpen,
  category,
}: MemoListPageData) {
  const activeCategoryId = category?.id ?? null;
  const returnTo = buildMemoListUrl(path, query);
  const filterTags = includeSelectedMemoListTag(usedTags, tags, query.tag);

  return (
    <div>
      <title>
        {category ? `${category.name} | My Memo` : "メモ一覧 | My Memo"}
      </title>
      <h1 className="sr-only">{category?.name ?? "メモ一覧"}</h1>
      {notice && (
        <div className="alert alert-warning mb-4" role="status">
          {notice}
        </div>
      )}
      <div className="sticky top-20 z-10 w-full">
        <CategoryTabs
          activeCategoryId={activeCategoryId}
          categories={categories}
        />
      </div>
      <MemoListViewController
        cards={result.items.map((memo) => ({
          id: memo.id,
          content: (
            <Memo
              key={memo.id}
              listPath={path}
              memo={memo}
              query={query}
              returnTo={returnTo}
              showCategory={!category}
            />
          ),
        }))}
        controls={
          <MemoListControls
            action={path}
            initialOpen={initialControlsOpen}
            query={query}
            tags={filterTags}
          />
        }
        key={path}
        listPath={path}
        table={
          <MemoListTable
            items={result.items}
            listPath={path}
            query={query}
            returnTo={returnTo}
            showCategory={!category}
          />
        }
      />
      <MemoPagination
        hasNextPage={result.hasNextPage}
        hasPageAfterNext={result.hasPageAfterNext}
        pathname={path}
        query={query}
      />
      <MemoTagEditor
        activeTagId={query.tag}
        availableTags={tags}
        key={`${path}?${queryString ?? ""}`}
        listPath={path}
        query={query}
        suggestedTags={usedTags}
        tagSuggestions={tagSuggestions}
      />
      <ActionFab categoryId={category?.id} />
    </div>
  );
}
