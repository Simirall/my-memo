import { AppLink } from "@/components/app-link";
import { getAccountDeletionStatusForUser } from "@/features/account-deletion/server/account-deletion";
import AccountDeletion from "@/islands/$account-deletion";
import InstallPrompt from "@/islands/$install-prompt";
import { getRequestContext, redirect } from "@/server/request-context";

export default async function Page() {
  const c = getRequestContext();
  const user = c.get("user");
  if (!user) return redirect("/login");

  const deletion = await getAccountDeletionStatusForUser(
    c.env.MY_MEMO_D1,
    user.id,
  );
  if (deletion) {
    return (
      <>
        <title>退会処理中 | My Memo</title>
        <AccountDeletion initialStatus={deletion.status} />
      </>
    );
  }

  const avatar = user.image ? (
    <img alt={`${user.name}のアバター`} src={user.image} />
  ) : (
    <div className="bg-base-300 flex size-full items-center justify-center">
      <span aria-hidden="true" className="text-2xl font-bold">
        {user.name.slice(0, 1).toUpperCase()}
      </span>
    </div>
  );

  return (
    <>
      <title>アカウント | My Memo</title>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">アカウント</h1>
          <p className="text-base-content/70">ログインアカウント情報</p>
        </div>

        <section aria-labelledby="profile-heading" className="space-y-4">
          <h2 className="text-lg font-bold" id="profile-heading">
            プロフィール
          </h2>
          <div className="rounded-box bg-base-200 flex flex-col gap-4 p-6 sm:flex-row sm:items-center">
            <div className="avatar">
              <div className="size-20 rounded-full">{avatar}</div>
            </div>
            <dl className="grid gap-3">
              <div>
                <dt className="text-sm font-semibold">名前</dt>
                <dd>{user.name}</dd>
              </div>
              <div>
                <dt className="text-sm font-semibold">メールアドレス</dt>
                <dd>{user.email}</dd>
              </div>
            </dl>
          </div>
        </section>

        <section aria-labelledby="github-heading" className="space-y-4">
          <h2 className="text-lg font-bold" id="github-heading">
            GitHub連携
          </h2>
          <div className="rounded-box bg-base-200 flex flex-wrap items-center justify-between gap-3 p-6">
            <p>GitHubでログイン中です。</p>
            <span className="badge badge-success">連携済み</span>
          </div>
        </section>

        <div className="rounded-box bg-base-200 flex flex-wrap gap-x-6 gap-y-2 p-6">
          <AppLink className="link" href="/terms">
            利用規約
          </AppLink>
          <AppLink className="link" href="/privacy">
            プライバシーポリシー
          </AppLink>
        </div>

        <InstallPrompt mode="settings" />

        <div className="divider" />
        <AccountDeletion initialStatus={null} />
      </div>
    </>
  );
}

export const getConfig = () => ({ render: "dynamic" as const });
