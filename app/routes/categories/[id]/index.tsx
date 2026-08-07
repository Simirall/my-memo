import { and, asc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { createRoute } from "honox/factory";
import { CategoryTabs } from "@/routes/-features/categories";
import { ActionFab, Memo, MemoTagEditor } from "@/routes/-features/memos";
import * as schema from "@/schema";

export default createRoute(async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.redirect("/login");
  }

  const db = drizzle(c.env.MY_MEMO_D1, { schema: schema });
  const id = c.req.param("id") ?? "";

  const [categories, tags, result] = await Promise.all([
    db
      .select()
      .from(schema.categoriesTable)
      .where(eq(schema.categoriesTable.userId, user.id)),
    db
      .select({ id: schema.tagsTable.id, name: schema.tagsTable.name })
      .from(schema.tagsTable)
      .where(eq(schema.tagsTable.userId, user.id))
      .orderBy(asc(schema.tagsTable.name)),
    db.query.categoriesTable.findFirst({
      where: and(
        eq(schema.categoriesTable.userId, user.id),
        eq(schema.categoriesTable.id, id),
      ),
      with: {
        memos: {
          with: {
            memoTags: { with: { tag: true } },
            attachments: true,
          },
        },
      },
    }),
  ]);

  if (!result) {
    return c.render(<div>Category not found</div>);
  }

  return c.render(
    <div>
      <h1 className="sr-only">{result.name}</h1>
      <CategoryTabs activeCategoryId={result.id} categories={categories} />
      <div className="flex flex-wrap items-start justify-center gap-4 py-4">
        {result.memos.map((memo) => (
          <Memo
            key={memo.id}
            memo={memo}
            returnTo={c.req.path}
            showCategory={false}
          />
        ))}
      </div>
      <MemoTagEditor availableTags={tags} />
      <ActionFab />
    </div>,
  );
});
