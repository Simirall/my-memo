import { getAppDb } from "@/features/access-control/authorization";
import { getUserCategories } from "@/features/categories/data/categories";
import { getTagSuggestions, getUserTags } from "@/features/tags/data/tags";
import UrlSummaryForm from "@/routes/memos/url-summary/-components/$url-summary-form";
import type { PageProps } from "@/server/request-context";
import { getRequestContext, redirect } from "@/server/request-context";

export default async function Page(props: PageProps) {
  const c = getRequestContext();
  const searchParams = new URLSearchParams(props.query);
  const user = c.get("user");
  if (!user) return redirect("/login");
  const db = getAppDb(c.env);

  const [categories, tags, tagSuggestions] = await Promise.all([
    getUserCategories(c.env.MY_MEMO_D1, user.id),
    getUserTags(db, user.id),
    getTagSuggestions(db, user.id),
  ]);
  const requestedCategoryId = searchParams.get("category") ?? undefined;
  const initialCategoryId = categories.some(
    (category) => category.id === requestedCategoryId,
  )
    ? requestedCategoryId
    : undefined;

  return (
    <div className="flex justify-center p-4 sm:p-8">
      <title>WebページをAI要約 | My Memo</title>
      <div className="card w-full max-w-2xl bg-base-100 shadow-sm">
        <div className="card-body">
          <div>
            <h1 className="font-bold text-2xl">WebページをAI要約</h1>
            <p className="text-base-content/70">
              URLを入力すると、ページの内容をAIが要約してメモに保存します。
            </p>
          </div>
          <UrlSummaryForm
            categories={categories}
            initialCategoryId={initialCategoryId}
            key={`${props.path}?${props.query ?? ""}`}
            tagSuggestions={tagSuggestions}
            tags={tags}
          />
        </div>
      </div>
    </div>
  );
}

export const getConfig = () => ({ render: "dynamic" as const });
