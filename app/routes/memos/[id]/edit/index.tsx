import { and, asc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { createRoute } from "honox/factory";
import {
  EditMemoForm,
  getSafeMemoListReturnTo,
} from "@/routes/-features/memos";
import * as schema from "@/schema";

export default createRoute(async (c) => {
  const user = c.get("user");
  if (!user) return c.redirect("/login");

  const memoId = c.req.param("id") ?? "";
  const db = drizzle(c.env.MY_MEMO_D1, { schema });
  const [categories, availableTags, memo] = await Promise.all([
    db
      .select()
      .from(schema.categoriesTable)
      .where(eq(schema.categoriesTable.userId, user.id))
      .orderBy(asc(schema.categoriesTable.name)),
    db
      .select({ id: schema.tagsTable.id, name: schema.tagsTable.name })
      .from(schema.tagsTable)
      .where(eq(schema.tagsTable.userId, user.id))
      .orderBy(asc(schema.tagsTable.name)),
    db.query.memosTable.findFirst({
      where: and(
        eq(schema.memosTable.id, memoId),
        eq(schema.memosTable.userId, user.id),
      ),
      with: {
        memoTags: { with: { tag: true } },
        attachments: true,
      },
    }),
  ]);

  if (!memo) {
    c.status(404);
    return c.render(
      <div className="p-4 text-center">メモが見つかりません。</div>,
    );
  }

  const tags = memo.memoTags
    .flatMap((memoTag) => (memoTag.tag ? [memoTag.tag] : []))
    .sort((a, b) => a.name.localeCompare(b.name, "ja"));
  const returnTo = getSafeMemoListReturnTo(
    c.req.query("returnTo"),
    new Set(availableTags.map((tag) => tag.id)),
  );

  return c.render(
    <div className="flex justify-center p-4 sm:p-8">
      <div className="card w-full max-w-2xl bg-base-100 shadow-sm">
        <div className="card-body [&>honox-island]:block [&>honox-island]:w-full">
          <h1 className="font-bold text-2xl">メモを編集</h1>
          <EditMemoForm
            availableTags={availableTags}
            categories={categories}
            memo={{
              id: memo.id,
              title: memo.title,
              content: memo.content,
              url: memo.url,
              categoryId: memo.categoryId,
              aiGenerated: memo.aiGenerated,
              tags,
              attachments: memo.attachments,
            }}
            returnTo={returnTo}
          />
        </div>
      </div>
    </div>,
  );
});
