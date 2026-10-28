import type { PageProps } from "waku/router";
import { getUserCategories } from "@/features/categories/data/categories";
import { SortableCategoryList } from "@/islands/$sortable-category-list";
import { CreateCategoryForm } from "@/routes/settings/categories/-components/$create-category-form";
import { getRequestContext, redirect } from "@/server/request-context";

export default async function Page(props: PageProps<"/settings/categories">) {
  const c = getRequestContext();
  const searchParams = new URLSearchParams(props.query);
  const user = c.get("user");
  if (!user) return redirect("/login");

  const result = await getUserCategories(c.env.MY_MEMO_D1, user.id);

  return (
    <>
      <title>カテゴリー | My Memo</title>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">カテゴリー</h1>
          <p className="text-base-content/70">カテゴリーを作成・管理します。</p>
        </div>

        <CreateCategoryForm
          created={(searchParams.get("created") ?? undefined) === "1"}
          error={
            (searchParams.get("error") ?? undefined) === "duplicate"
              ? "同じ名前のカテゴリーがすでに登録されています。"
              : undefined
          }
        />

        <section aria-labelledby="category-list-heading" className="space-y-3">
          <h2 className="text-lg font-bold" id="category-list-heading">
            カテゴリー一覧
          </h2>
          {result.length === 0 ? (
            <p className="rounded-box bg-base-200 text-base-content/70 p-6">
              カテゴリーはまだありません。
            </p>
          ) : (
            <SortableCategoryList initialCategories={result} />
          )}
        </section>
      </div>
    </>
  );
}

export const getConfig = () => ({ render: "dynamic" as const });
