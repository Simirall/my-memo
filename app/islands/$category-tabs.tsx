import { useEffect, useRef } from "hono/jsx";
import type z from "zod";
import { FolderOpenIcon } from "@/components/folder-open-icon";
import type { categorySchema } from "@/features/categories/schema/category-schema";
import {
  buildMemoListUrl,
  type MemoListQuery,
} from "@/features/memos/list/query/memo-list-query";

type Category = Pick<z.infer<typeof categorySchema.read>, "id" | "name">;

export default function CategoryTabs({
  categories,
  activeCategoryId,
  query = { sort: "desc", page: 1 },
}: {
  categories: ReadonlyArray<Category>;
  activeCategoryId: string | null;
  query?: MemoListQuery;
}) {
  const tabsRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (CSS.supports("scroll-initial-target", "nearest")) return;
    tabsRef.current
      ?.querySelector<HTMLElement>('[aria-current="page"]')
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeCategoryId]);

  return (
    <nav
      aria-label="メモのカテゴリー"
      className="tabs tabs-box flex-nowrap overflow-x-auto bg-base-300/70 shadow backdrop-blur-sm"
      ref={tabsRef}
    >
      <a
        aria-current={activeCategoryId === null ? "page" : undefined}
        className={`tab shrink-0 whitespace-nowrap ${
          activeCategoryId === null ? "[scroll-initial-target:nearest]" : ""
        }`}
        href={buildMemoListUrl("/", { ...query, page: 1 })}
      >
        すべて
      </a>
      {categories.map((category) => {
        const isActive = category.id === activeCategoryId;

        return (
          <a
            aria-current={isActive ? "page" : undefined}
            className={`tab inline-flex shrink-0 items-center gap-1 whitespace-nowrap ${
              isActive ? "[scroll-initial-target:nearest]" : ""
            }`}
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
}
