import { getAppDb } from "@/features/access-control/authorization";
import { getUserTags } from "@/features/tags/data/tags";
import { TagList } from "@/islands/$tag-list";
import { getRequestContext, redirect } from "@/server/request-context";

export default async function Page() {
  const c = getRequestContext();
  const user = c.get("user");
  if (!user) return redirect("/login");

  const tags = await getUserTags(getAppDb(c.env), user.id);

  return (
    <>
      <title>タグ | My Memo</title>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">タグ</h1>
          <p className="text-base-content/70">タグを一覧・管理します。</p>
        </div>

        <section aria-labelledby="tag-list-heading" className="space-y-3">
          <h2 className="text-lg font-bold" id="tag-list-heading">
            タグ一覧
          </h2>
          {tags.length === 0 ? (
            <p className="rounded-box bg-base-200 text-base-content/70 p-6">
              タグはまだありません。
            </p>
          ) : (
            <TagList initialTags={tags} />
          )}
        </section>
      </div>
    </>
  );
}

export const getConfig = () => ({ render: "dynamic" as const });
