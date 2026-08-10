import type { MemoListQuery } from "@/features/memos/list/query/memo-list-query";
import { buildMemoListUrl } from "@/features/memos/list/query/memo-list-query";

const pageUrl = (pathname: string, query: MemoListQuery, page: number) =>
  buildMemoListUrl(pathname, { ...query, page });

export const MemoPagination = ({
  hasNextPage,
  pathname,
  query,
}: {
  hasNextPage: boolean;
  pathname: string;
  query: MemoListQuery;
}) => {
  if (query.page === 1 && !hasNextPage) return null;

  const firstPastPage = Math.max(2, query.page - 2);
  const pastPages = Array.from(
    { length: Math.max(0, query.page - firstPastPage) },
    (_, index) => firstPastPage + index,
  );

  return (
    <nav aria-label="メモ一覧のページ" className="flex justify-center py-4">
      <div className="join">
        {query.page > 1 ? (
          <a
            aria-label="前のページ"
            className="btn join-item"
            href={pageUrl(pathname, query, query.page - 1)}
          >
            前へ
          </a>
        ) : (
          <button className="btn join-item" disabled type="button">
            前へ
          </button>
        )}
        <a
          aria-current={query.page === 1 ? "page" : undefined}
          aria-label="1ページ目"
          className={`btn join-item ${query.page === 1 ? "btn-soft btn-primary" : ""}`}
          href={pageUrl(pathname, query, 1)}
        >
          1
        </a>
        {firstPastPage > 2 && (
          <span aria-hidden="true" className="btn btn-disabled join-item">
            …
          </span>
        )}
        {pastPages.map((page) => (
          <a
            aria-label={`${page}ページ目`}
            className="btn join-item"
            href={pageUrl(pathname, query, page)}
            key={page}
          >
            {page}
          </a>
        ))}
        {query.page > 1 && (
          <a
            aria-current="page"
            aria-label={`${query.page}ページ目`}
            className="btn btn-soft btn-primary join-item"
            href={pageUrl(pathname, query, query.page)}
          >
            {query.page}
          </a>
        )}
        {hasNextPage && (
          <a
            aria-label={`${query.page + 1}ページ目`}
            className="btn join-item"
            href={pageUrl(pathname, query, query.page + 1)}
          >
            {query.page + 1}
          </a>
        )}
        {hasNextPage ? (
          <a
            aria-label="次のページ"
            className="btn join-item"
            href={pageUrl(pathname, query, query.page + 1)}
          >
            次へ
          </a>
        ) : (
          <button className="btn join-item" disabled type="button">
            次へ
          </button>
        )}
      </div>
    </nav>
  );
};
