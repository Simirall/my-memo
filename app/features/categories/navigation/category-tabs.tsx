import type z from "zod";
import { FolderOpenIcon } from "@/components/folder-open-icon";
import type { categorySchema } from "@/features/categories/schema/category-schema";
import {
  buildMemoListUrl,
  type MemoListQuery,
} from "@/features/memos/list/query/memo-list-query";

type Category = z.infer<typeof categorySchema.read>;

export const CategoryTabs = ({
  categories,
  activeCategoryId,
  query = { sort: "desc", page: 1 },
}: {
  categories: ReadonlyArray<Category>;
  activeCategoryId: string | null;
  query?: MemoListQuery;
}) => {
  return (
    <nav
      aria-label="メモのカテゴリー"
      className="tabs tabs-box sticky top-20 z-10 w-full overflow-x-auto bg-base-300/70 shadow backdrop-blur-sm"
    >
      <a
        aria-current={activeCategoryId === null ? "page" : undefined}
        className={`tab whitespace-nowrap`}
        href={buildMemoListUrl("/", { ...query, page: 1 })}
      >
        すべて
      </a>
      {categories.map((category) => {
        const isActive = category.id === activeCategoryId;

        return (
          <a
            aria-current={isActive ? "page" : undefined}
            className={`tab inline-flex items-center gap-1 whitespace-nowrap`}
            href={buildMemoListUrl(`/categories/${category.id}`, {
              ...query,
              page: 1,
            })}
            key={category.id}
          >
            <FolderOpenIcon />
            {category.name}
          </a>
        );
      })}
    </nav>
  );
};
