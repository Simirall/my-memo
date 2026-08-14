import { createRoute } from "honox/factory";
import { getAppDb } from "@/features/access-control/authorization";
import { getUserTags } from "@/features/tags/data/tags";
import { TagList } from "@/islands/$tag-list";
import { SettingsLayout } from "../-components/settings-layout";

export default createRoute(async (c) => {
  const user = c.get("user");
  if (!user) return c.redirect("/login");

  const tags = await getUserTags(getAppDb(c.env), user.id);

  return c.render(
    <SettingsLayout activeSection="tags">
      <title>タグ | My Memo</title>
      <div className="space-y-6">
        <div>
          <h1 className="font-bold text-2xl">タグ</h1>
          <p className="text-base-content/70">タグを一覧・管理します。</p>
        </div>

        <section aria-labelledby="tag-list-heading" className="space-y-3">
          <h2 className="font-bold text-lg" id="tag-list-heading">
            タグ一覧
          </h2>
          {tags.length === 0 ? (
            <p className="rounded-box bg-base-200 p-6 text-base-content/70">
              タグはまだありません。
            </p>
          ) : (
            <TagList initialTags={tags} />
          )}
        </section>
      </div>
    </SettingsLayout>,
  );
});
