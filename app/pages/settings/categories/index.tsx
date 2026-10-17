import { getUserCategories } from "@/features/categories/data/categories";
import { SortableCategoryList } from "@/islands/$sortable-category-list";
import { SettingsLayout } from "@/routes/settings/-components/settings-layout";
import { CreateCategoryForm } from "@/routes/settings/categories/-components/$create-category-form";
import type { PageProps } from "@/server/request-context";
import { getRequestContext, redirect } from "@/server/request-context";

export default async function Page(props: PageProps) {
  const c = getRequestContext();
  const searchParams = new URLSearchParams(props.query);
  const user = c.get("user");
  if (!user) return redirect("/login");

  const result = await getUserCategories(c.env.MY_MEMO_D1, user.id);

  return (
    <SettingsLayout activeSection="categories">
      <title>カテゴリー | My Memo</title>
      <div className="space-y-6">
        <div>
          <h1 className="font-bold text-2xl">カテゴリー</h1>
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
          <h2 className="font-bold text-lg" id="category-list-heading">
            カテゴリー一覧
          </h2>
          {result.length === 0 ? (
            <p className="rounded-box bg-base-200 p-6 text-base-content/70">
              カテゴリーはまだありません。
            </p>
          ) : (
            <SortableCategoryList initialCategories={result} />
          )}
        </section>
      </div>
    </SettingsLayout>
  );
}

export const getConfig = () => ({ render: "dynamic" as const });
