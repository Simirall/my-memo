import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { getAppDb } from "@/features/access-control/authorization";
import { getUserCategories } from "@/features/categories/data/categories";
import { getSafeMemoListReturnTo } from "@/features/memos/list/query/memo-list-query";
import { getTagSuggestions, getUserTags } from "@/features/tags/data/tags";
import EditMemoForm from "@/routes/memos/[id]/edit/-components/$edit-memo-form";
import * as schema from "@/schema";
import type { PageProps } from "@/server/request-context";
import {
  getRequestContext,
  notFound,
  redirect,
} from "@/server/request-context";

export default async function Page(props: PageProps) {
  const c = getRequestContext();
  const searchParams = new URLSearchParams(props.query);
  const user = c.get("user");
  if (!user) return redirect("/login");

  const memoId = props.id ?? "";
  const db = drizzle(c.env.MY_MEMO_D1, { schema });
  const appDb = getAppDb(c.env);
  const [categories, availableTags, tagSuggestions, memo] = await Promise.all([
    getUserCategories(c.env.MY_MEMO_D1, user.id),
    getUserTags(appDb, user.id),
    getTagSuggestions(appDb, user.id),
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
    return notFound();
  }

  const tags = memo.memoTags
    .flatMap((memoTag) => (memoTag.tag ? [memoTag.tag] : []))
    .sort((a, b) => a.name.localeCompare(b.name, "ja"));
  const returnTo = getSafeMemoListReturnTo(
    searchParams.get("returnTo") ?? undefined,
    new Set(availableTags.map((tag) => tag.id)),
  );

  return (
    <div className="flex justify-center p-4 sm:p-8">
      <title>{memo.title}を編集 | My Memo</title>
      <div className="card w-full max-w-2xl bg-base-100 shadow-sm">
        <div className="card-body">
          <h1 className="font-bold text-2xl">メモを編集</h1>
          <EditMemoForm
            availableTags={availableTags}
            categories={categories}
            key={memo.id}
            memo={{
              id: memo.id,
              title: memo.title,
              content: memo.content,
              url: memo.url,
              categoryId: memo.categoryId,
              isAiSummary: memo.isAiSummary,
              tags,
              attachments: memo.attachments,
            }}
            returnTo={returnTo}
            tagSuggestions={tagSuggestions}
          />
        </div>
      </div>
    </div>
  );
}

export const getConfig = () => ({ render: "dynamic" as const });
