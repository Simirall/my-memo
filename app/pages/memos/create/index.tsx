import type { PageProps } from "waku/router";
import { getAppDb } from "@/features/access-control/authorization";
import { getUserCategories } from "@/features/categories/data/categories";
import { getShareIntake } from "@/features/sharing/intake/share-intake";
import { getTagSuggestions, getUserTags } from "@/features/tags/data/tags";
import CreateMemoForm from "@/routes/memos/create/-components/$create-memo-form";
import { getRequestContext, redirect } from "@/server/request-context";

export default async function Page(props: PageProps<"/memos/create">) {
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

  const shareId = searchParams.get("shareId") ?? undefined;
  const shareIntake = shareId
    ? await getShareIntake(c.env, user.id, shareId)
    : undefined;
  if (shareId && !shareIntake) {
    return redirect(
      "/memos/create?error=" +
        encodeURIComponent("共有内容が見つからないか、期限切れです。"),
    );
  }
  const requestedCategoryId = searchParams.get("category") ?? undefined;
  const initialCategoryId = categories.some(
    (category) => category.id === requestedCategoryId,
  )
    ? requestedCategoryId
    : undefined;

  return (
    <div className="flex justify-center p-4 sm:p-8">
      <title>メモを作成 | My Memo</title>
      <div className="card w-full max-w-2xl bg-base-100 shadow-sm">
        <div className="card-body">
          <h1 className="font-bold text-2xl">メモを作成</h1>
          <CreateMemoForm
            categories={categories}
            error={searchParams.get("error") ?? undefined}
            initialCategoryId={initialCategoryId}
            initialValues={shareIntake?.prefill}
            key={`${props.path}?${props.query ?? ""}`}
            shareIntake={shareIntake}
            tagSuggestions={tagSuggestions}
            tags={tags}
          />
        </div>
      </div>
    </div>
  );
}

export const getConfig = () => ({ render: "dynamic" as const });
