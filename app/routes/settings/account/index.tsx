import { createRoute } from "honox/factory";
import { getAccountDeletionStatusForUser } from "@/features/account-deletion/server/account-deletion";
import AccountDeletion from "@/islands/$account-deletion";
import InstallPrompt from "@/islands/$install-prompt";
import { SettingsLayout } from "../-components/settings-layout";

export default createRoute(async (c) => {
  const user = c.get("user");
  if (!user) return c.redirect("/login");

  const deletion = await getAccountDeletionStatusForUser(
    c.env.MY_MEMO_D1,
    user.id,
  );
  if (deletion) {
    return c.render(
      <SettingsLayout activeSection="account">
        <title>退会処理中 | My Memo</title>
        <AccountDeletion initialStatus={deletion.status} />
      </SettingsLayout>,
    );
  }

  const avatar = user.image ? (
    <img alt={`${user.name}のアバター`} src={user.image} />
  ) : (
    <div className="flex size-full items-center justify-center bg-base-300">
      <span aria-hidden="true" className="font-bold text-2xl">
        {user.name.slice(0, 1).toUpperCase()}
      </span>
    </div>
  );

  return c.render(
    <SettingsLayout activeSection="account">
      <title>アカウント | My Memo</title>
      <div className="space-y-6">
        <div>
          <h1 className="font-bold text-2xl">アカウント</h1>
          <p className="text-base-content/70">ログインアカウント情報</p>
        </div>

        <section aria-labelledby="profile-heading" className="space-y-4">
          <h2 className="font-bold text-lg" id="profile-heading">
            プロフィール
          </h2>
          <div className="flex flex-col gap-4 rounded-box bg-base-200 p-6 sm:flex-row sm:items-center">
            <div className="avatar">
              <div className="size-20 rounded-full">{avatar}</div>
            </div>
            <dl className="grid gap-3">
              <div>
                <dt className="font-semibold text-sm">名前</dt>
                <dd>{user.name}</dd>
              </div>
              <div>
                <dt className="font-semibold text-sm">メールアドレス</dt>
                <dd>{user.email}</dd>
              </div>
            </dl>
          </div>
        </section>

        <section aria-labelledby="github-heading" className="space-y-4">
          <h2 className="font-bold text-lg" id="github-heading">
            GitHub連携
          </h2>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-box bg-base-200 p-6">
            <p>GitHubでログイン中です。</p>
            <span className="badge badge-success">連携済み</span>
          </div>
        </section>

        <div className="flex flex-wrap gap-x-6 gap-y-2 rounded-box bg-base-200 p-6">
          <a className="link" href="/terms">
            利用規約
          </a>
          <a className="link" href="/privacy">
            プライバシーポリシー
          </a>
        </div>

        <InstallPrompt mode="settings" />

        <div className="divider" />
        <AccountDeletion initialStatus={null} />
      </div>
    </SettingsLayout>,
  );
});
