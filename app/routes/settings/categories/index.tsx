import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { createRoute } from "honox/factory";
import { DeleteButton } from "@/islands/$delete-button";
import { categoriesTable } from "@/schema";
import { SettingsLayout } from "../-components/settings-layout";
import { CreateCategoryForm } from "./-components/$create-category-form";

export default createRoute(async (c) => {
  const user = c.get("user");
  if (!user) return c.redirect("/login");

  const db = drizzle(c.env.MY_MEMO_D1);
  const result = await db
    .select()
    .from(categoriesTable)
    .where(eq(categoriesTable.userId, user.id));

  return c.render(
    <SettingsLayout activeSection="categories">
      <div className="space-y-6">
        <div>
          <h1 className="font-bold text-2xl">カテゴリー</h1>
          <p className="text-base-content/70">カテゴリーを作成・管理します。</p>
        </div>

        <CreateCategoryForm />

        <section aria-labelledby="category-list-heading" className="space-y-3">
          <h2 className="font-bold text-lg" id="category-list-heading">
            カテゴリー一覧
          </h2>
          {result.length === 0 ? (
            <p className="rounded-box bg-base-200 p-6 text-base-content/70">
              カテゴリーはまだありません。
            </p>
          ) : (
            <ul className="list rounded-box bg-base-200">
              {result.map((category) => (
                <li className="list-row items-center" key={category.id}>
                  <a
                    className="list-col-grow font-semibold hover:underline"
                    href={`/categories/${category.id}`}
                  >
                    {category.name}
                  </a>
                  <DeleteButton
                    action={`/api/categories/delete/${category.id}`}
                    confirmMessage={`「${category.name}」を削除しますか？`}
                    label={`カテゴリー「${category.name}」を削除`}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </SettingsLayout>,
  );
});
