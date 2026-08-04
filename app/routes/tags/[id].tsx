import { and, asc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { createRoute } from "honox/factory";
import { Memo } from "../../components/memo";
import { ActionFab } from "../../islands/action-fab";
import MemoTagEditor from "../../islands/memos/tag-editor";
import * as schema from "../../schema";

export default createRoute(async (c) => {
  const user = c.get("user");
  if (!user) return c.redirect("/login");

  const db = drizzle(c.env.MY_MEMO_D1, { schema });
  const id = c.req.param("id") ?? "";
  const [allTags, result] = await Promise.all([
    db
      .select({ id: schema.tagsTable.id, name: schema.tagsTable.name })
      .from(schema.tagsTable)
      .where(eq(schema.tagsTable.userId, user.id))
      .orderBy(asc(schema.tagsTable.name)),
    db.query.tagsTable.findFirst({
      where: and(
        eq(schema.tagsTable.id, id),
        eq(schema.tagsTable.userId, user.id),
      ),
      with: {
        memoTags: {
          with: {
            memo: {
              with: {
                category: true,
                memoTags: { with: { tag: true } },
              },
            },
          },
        },
      },
    }),
  ]);

  if (!result) {
    c.status(404);
    return c.render(
      <div className="p-4 text-center">タグが見つかりません。</div>,
    );
  }

  const memos = result.memoTags
    .map((memoTag) => memoTag.memo)
    .filter((memo): memo is NonNullable<typeof memo> => memo !== null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return c.render(
    <div className="space-y-4 p-4">
      <header className="space-y-1">
        <h1 className="font-bold text-2xl">#{result.name} のメモ</h1>
        <p
          className="text-base-content/70"
          data-count={memos.length}
          data-tag-result-count
        >
          {memos.length}件
        </p>
      </header>
      <div className="flex flex-wrap items-start justify-center gap-4">
        {memos.map((memo) => (
          <Memo key={memo.id} memo={memo} showCategory />
        ))}
      </div>
      <MemoTagEditor activeTagId={result.id} availableTags={allTags} />
      <p
        className="py-12 text-center text-base-content/70"
        data-tag-result-empty
        hidden={memos.length > 0}
      >
        このタグのメモはありません。
      </p>
      <ActionFab />
    </div>,
  );
});
