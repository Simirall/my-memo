import { createRoute } from "honox/factory";
import { SettingsLayout } from "../../components/settings-layout";
import { DeleteButton } from "../../islands/delete-button";
import { getAppDb } from "../../utils/authorization";
import { getUserTags } from "../../utils/tags";

export default createRoute(async (c) => {
  const user = c.get("user");
  if (!user) return c.redirect("/login");

  const tags = await getUserTags(getAppDb(c.env), user.id);

  return c.render(
    <SettingsLayout activeSection="tags">
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
            <ul className="list rounded-box bg-base-200">
              {tags.map((tag) => (
                <li className="list-row items-center" key={tag.id}>
                  <a
                    className="list-col-grow font-semibold hover:underline"
                    href={`/tags/${tag.id}`}
                  >
                    #{tag.name}
                  </a>
                  <DeleteButton
                    action={`/api/tags/delete/${tag.id}`}
                    confirmMessage={`「#${tag.name}」を削除しますか？`}
                    label={`タグ「${tag.name}」を削除`}
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
