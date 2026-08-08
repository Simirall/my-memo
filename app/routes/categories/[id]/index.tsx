import { and, asc, eq } from "drizzle-orm";
import { getCookie } from "hono/cookie";
import { createRoute } from "honox/factory";
import { CategoryTabs } from "@/routes/-features/categories";
import {
  ActionFab,
  buildMemoListUrl,
  getMemoList,
  getMemoListDb,
  getUsedMemoTags,
  includeSelectedMemoListTag,
  Memo,
  MemoListControls,
  MemoTagEditor,
  parseMemoListQuery,
} from "@/routes/-features/memos";
import { MEMO_LIST_CONTROLS_OPEN_COOKIE } from "@/routes/-features/memos/memo-list-controls-state";
import * as schema from "@/schema";

export default createRoute(async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.redirect("/login");
  }

  const db = getMemoListDb(c.env);
  const id = c.req.param("id") ?? "";

  const [categories, tags, usedTags, result] = await Promise.all([
    db
      .select()
      .from(schema.categoriesTable)
      .where(eq(schema.categoriesTable.userId, user.id)),
    db
      .select({ id: schema.tagsTable.id, name: schema.tagsTable.name })
      .from(schema.tagsTable)
      .where(eq(schema.tagsTable.userId, user.id))
      .orderBy(asc(schema.tagsTable.name)),
    getUsedMemoTags(db, user.id, id),
    db.query.categoriesTable.findFirst({
      where: and(
        eq(schema.categoriesTable.userId, user.id),
        eq(schema.categoriesTable.id, id),
      ),
    }),
  ]);

  if (!result) {
    return c.render(<div>Category not found</div>);
  }
  const query = parseMemoListQuery(
    new URL(c.req.url).searchParams,
    new Set(tags.map((tag) => tag.id)),
  );
  const memos = await getMemoList(db, user.id, query, result.id);
  const filterTags = includeSelectedMemoListTag(usedTags, tags, query.tag);
  const returnTo = buildMemoListUrl(c.req.path, query);

  return c.render(
    <div>
      <h1 className="sr-only">{result.name}</h1>
      <CategoryTabs
        activeCategoryId={result.id}
        categories={categories}
        query={query}
      />
      <div className="mt-4 [&>honox-island]:block [&>honox-island]:w-full">
        <MemoListControls
          action={c.req.path}
          initialOpen={getCookie(c, MEMO_LIST_CONTROLS_OPEN_COOKIE) === "1"}
          query={query}
          tags={filterTags}
        />
      </div>
      <div
        className="grid w-full auto-rows-auto grid-cols-[repeat(auto-fit,minmax(min(100%,30rem),30rem))] items-stretch justify-center gap-4 py-4"
        data-memo-list-grid
      >
        {memos.map((memo) => (
          <Memo
            key={memo.id}
            listPath={c.req.path}
            memo={memo}
            query={query}
            returnTo={returnTo}
            showCategory={false}
          />
        ))}
      </div>
      {memos.length === 0 && (
        <p
          className="rounded-box bg-base-200 p-6 text-center text-base-content/70"
          data-memo-list-empty
        >
          条件に一致するメモはありません。
        </p>
      )}
      <MemoTagEditor
        activeTagId={query.tag}
        availableTags={tags}
        listPath={c.req.path}
        query={query}
      />
      <ActionFab />
    </div>,
  );
});
