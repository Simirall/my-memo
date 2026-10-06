import { createRoute } from "honox/factory";
import { getAppDb } from "@/features/access-control/authorization";
import { getUserCategories } from "@/features/categories/data/categories";
import { getTagSuggestions, getUserTags } from "@/features/tags/data/tags";
import BulkMemoForm from "./-components/$bulk-memo-form";

export default createRoute(async (c) => {
  const user = c.get("user");
  if (!user) return c.redirect("/login");
  const db = getAppDb(c.env);
  const [categories, tags, tagSuggestions] = await Promise.all([
    getUserCategories(c.env.MY_MEMO_D1, user.id),
    getUserTags(db, user.id),
    getTagSuggestions(db, user.id),
  ]);
  return c.render(
    <div className="mx-auto w-full max-w-screen-2xl space-y-4 p-4 sm:p-8 [&>honox-island]:block [&>honox-island]:w-full">
      <title>まとめて入力 | My Memo</title>
      <h1 className="font-bold text-2xl">メモをまとめて入力</h1>
      <p>
        最大30件まで入力できます。カテゴリー・タグは各メモに手動で設定します。
      </p>
      <BulkMemoForm
        categories={categories}
        initialMemoId={crypto.randomUUID()}
        tagSuggestions={tagSuggestions}
        tags={tags}
      />
    </div>,
  );
});
