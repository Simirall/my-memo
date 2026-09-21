import magnifyingGlassIcon from "@phosphor-icons/core/assets/regular/magnifying-glass.svg?raw";
import pencilSimpleIcon from "@phosphor-icons/core/assets/regular/pencil-simple.svg?raw";
import { PhosphorIcon } from "@/components/phosphor-icon";
import { DeleteButton } from "@/islands/$delete-button";
import { isSafeMemoUrl } from "../../model/memo-url";
import type { MemoWithTags } from "../card/memo";
import { renderMarkdownText } from "../card/render-markdown";
import type { MemoListQuery } from "../query/memo-list-query";
import { buildMemoListUrl, replaceMemoListTag } from "../query/memo-list-query";

export function MemoListTable({
  items,
  listPath,
  query,
  returnTo,
  showCategory,
}: {
  items: ReadonlyArray<MemoWithTags>;
  listPath: string;
  query: MemoListQuery;
  returnTo: string;
  showCategory: boolean;
}) {
  return (
    <div className="overflow-x-auto py-4" data-memo-list-view="list" hidden>
      <table className="table-sm table min-w-5xl">
        <thead>
          <tr>
            <th>タイトル</th>
            <th>
              <span className="sr-only">AI要約</span>
            </th>
            {showCategory && <th>カテゴリ</th>}
            <th>タグ</th>
            <th>本文</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {items.map((memo) => {
            const tags = [
              ...(memo.tags ??
                memo.memoTags?.flatMap(({ tag }) => (tag ? [tag] : [])) ??
                []),
            ].sort((a, b) => a.name.localeCompare(b.name, "ja"));
            const visibleTags = tags.slice(0, 3);
            return (
              <tr data-memo-list-row={memo.id} key={memo.id}>
                <th className="max-w-56 whitespace-normal break-all">
                  {memo.url && isSafeMemoUrl(memo.url) ? (
                    <a
                      className="text-info hover:underline"
                      href={memo.url}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      {memo.title}
                    </a>
                  ) : (
                    memo.title
                  )}
                </th>
                <td>
                  {memo.isAiSummary === 1 && (
                    <span aria-label="AI要約" role="img">
                      ✨
                    </span>
                  )}
                </td>
                {showCategory && (
                  <td>
                    {memo.category && (
                      <a
                        className="badge badge-soft badge-primary whitespace-nowrap"
                        href={buildMemoListUrl(
                          `/categories/${memo.category.id}`,
                          { ...query, page: 1 },
                        )}
                      >
                        {memo.category.name}
                      </a>
                    )}
                  </td>
                )}
                <td>
                  <div data-memo-tag-list data-memo-tags-limit="3">
                    <ul className="flex min-w-48 flex-wrap gap-1">
                      {visibleTags.map((tag) => (
                        <li key={tag.id}>
                          <a
                            className="badge badge-soft badge-info hover:underline"
                            href={replaceMemoListTag(listPath, query, tag.id)}
                          >
                            #{tag.name}
                          </a>
                        </li>
                      ))}
                    </ul>
                    <span
                      className="text-base-content/60 text-xs"
                      data-memo-tags-overflow
                      hidden={tags.length <= 3}
                    >
                      +{tags.length - 3}
                    </span>
                  </div>
                </td>
                <td className="max-w-96 whitespace-normal">
                  <p className="line-clamp-3">
                    {memo.content ? renderMarkdownText(memo.content) : ""}
                  </p>
                </td>
                <td>
                  <div className="flex gap-1 whitespace-nowrap">
                    <button
                      aria-label={`詳細: ${memo.title}`}
                      className="btn btn-square btn-sm"
                      data-memo-detail={memo.id}
                      type="button"
                    >
                      <PhosphorIcon svg={magnifyingGlassIcon} />
                    </button>
                    <a
                      aria-label={`編集: ${memo.title}`}
                      className="btn btn-square btn-sm"
                      href={`/memos/${encodeURIComponent(memo.id)}/edit?returnTo=${encodeURIComponent(returnTo)}`}
                    >
                      <PhosphorIcon svg={pencilSimpleIcon} />
                    </a>
                    <DeleteButton
                      action={`/api/memos/delete/${memo.id}?returnTo=${encodeURIComponent(returnTo)}`}
                      className="btn btn-error btn-soft btn-square btn-sm"
                      confirmMessage={`「${memo.title}」を削除しますか？`}
                      label={`メモ「${memo.title}」を削除`}
                    />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
