import { createRoute } from "honox/factory";
import { getAppDb } from "@/features/access-control/authorization";
import { getUserCategories } from "@/features/categories/data/categories";
import { getShareIntake } from "@/features/sharing/intake/share-intake";
import { getTagSuggestions, getUserTags } from "@/features/tags/data/tags";
import CreateMemoForm from "./-components/$create-memo-form";

export default createRoute(async (c) => {
  const user = c.get("user");
  if (!user) return c.redirect("/login");
  const db = getAppDb(c.env);

  const [categories, tags, tagSuggestions] = await Promise.all([
    getUserCategories(c.env.MY_MEMO_D1, user.id),
    getUserTags(db, user.id),
    getTagSuggestions(db, user.id),
  ]);

  const shareId = c.req.query("shareId");
  const shareIntake = shareId
    ? await getShareIntake(c.env, user.id, shareId)
    : undefined;
  if (shareId && !shareIntake) {
    return c.redirect(
      "/memos/create?error=" +
        encodeURIComponent("共有内容が見つからないか、期限切れです。"),
    );
  }
  const requestedCategoryId = c.req.query("category");
  const initialCategoryId = categories.some(
    (category) => category.id === requestedCategoryId,
  )
    ? requestedCategoryId
    : undefined;

  return c.render(
    <div className="flex justify-center p-4 sm:p-8">
      <title>メモを作成 | My Memo</title>
      <div className="card w-full max-w-2xl bg-base-100 shadow-sm">
        <div className="card-body [&>honox-island]:block [&>honox-island]:w-full">
          <h1 className="font-bold text-2xl">メモを作成</h1>
          <CreateMemoForm
            categories={categories}
            error={c.req.query("error")}
            initialCategoryId={initialCategoryId}
            initialValues={shareIntake?.prefill}
            shareIntake={shareIntake}
            tagSuggestions={tagSuggestions}
            tags={tags}
          />
        </div>
      </div>
    </div>,
  );
});
