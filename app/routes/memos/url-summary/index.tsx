import { asc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { createRoute } from "honox/factory";
import { categoriesTable, tagsTable } from "@/schema";
import UrlSummaryForm from "./-components/$url-summary-form";

export default createRoute(async (c) => {
  const user = c.get("user");
  if (!user) return c.redirect("/login");
  const db = drizzle(c.env.MY_MEMO_D1);

  const [categories, tags] = await Promise.all([
    db
      .select()
      .from(categoriesTable)
      .where(eq(categoriesTable.userId, user.id)),
    db
      .select({ id: tagsTable.id, name: tagsTable.name })
      .from(tagsTable)
      .where(eq(tagsTable.userId, user.id))
      .orderBy(asc(tagsTable.name)),
  ]);
  const requestedCategoryId = c.req.query("category");
  const initialCategoryId = categories.some(
    (category) => category.id === requestedCategoryId,
  )
    ? requestedCategoryId
    : undefined;

  return c.render(
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
            tags={tags}
          />
        </div>
      </div>
    </div>,
  );
});
