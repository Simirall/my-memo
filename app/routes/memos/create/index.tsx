import { asc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { createRoute } from "honox/factory";
import { getShareIntake } from "@/features/sharing/intake/share-intake";
import { categoriesTable, tagsTable } from "@/schema";
import CreateMemoForm from "./-components/$create-memo-form";

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

  return c.render(
    <div className="flex justify-center p-4 sm:p-8">
      <div className="card w-full max-w-2xl bg-base-100 shadow-sm">
        <div className="card-body [&>honox-island]:block [&>honox-island]:w-full">
          <div>
            <h1 className="font-bold text-2xl">メモを作成</h1>
            <p className="text-base-content/70">
              残しておきたい内容を入力します。
            </p>
          </div>
          <CreateMemoForm
            categories={categories}
            error={c.req.query("error")}
            initialValues={shareIntake?.prefill}
            shareIntake={shareIntake}
            tags={tags}
          />
        </div>
      </div>
    </div>,
  );
});
