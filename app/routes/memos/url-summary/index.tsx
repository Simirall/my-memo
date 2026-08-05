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

  return c.render(
    <div className="flex justify-center p-8">
      <div className="card w-96 bg-base-100 shadow-sm">
        <div className="card-body">
          <UrlSummaryForm
            categories={categories}
            error={c.req.query("error")}
            tags={tags}
          />
        </div>
      </div>
    </div>,
  );
});
