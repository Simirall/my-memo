import type z from "zod";
import type { categorySchema } from "@/routes/-features/categories";
import { FolderOpenIcon } from "@/routes/-shared";

type Category = z.infer<typeof categorySchema.read>;

export const CategoryTabs = ({
  categories,
  activeCategoryId,
}: {
  categories: ReadonlyArray<Category>;
  activeCategoryId: string | null;
}) => {
  return (
    <nav aria-label="Memo categories" className="tabs tabs-box">
      <a
        aria-current={activeCategoryId === null ? "page" : undefined}
        className={`tab whitespace-nowrap ${activeCategoryId === null ? "tab-active" : ""}`}
        href="/"
      >
        すべて
      </a>
      {categories.map((category) => {
        const isActive = category.id === activeCategoryId;

        return (
          <a
            aria-current={isActive ? "page" : undefined}
            className={`tab inline-flex items-center gap-1 whitespace-nowrap ${isActive ? "tab-active" : ""}`}
            href={`/categories/${category.id}`}
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
