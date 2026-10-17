import AccountDeletionComplete from "@/islands/$account-deletion-complete";
import { LoginButton } from "@/routes/(auth)/login/-components/$login-button";
import type { PageProps } from "@/server/request-context";
import { getRequestContext } from "@/server/request-context";

export default function Page(props: PageProps) {
  const _c = getRequestContext();
  const searchParams = new URLSearchParams(props.query);
  const callbackURL = searchParams.get("callbackURL") ?? undefined;
  const accountDeleted =
    (searchParams.get("accountDeleted") ?? undefined) === "1";

  return (
    <div className="space-y-8 text-center">
      <title>ログイン | My Memo</title>
      <h1 className="font-bold text-5xl">My Memo</h1>
      {accountDeleted && <AccountDeletionComplete />}
      <LoginButton callbackURL={callbackURL} />
    </div>
  );
}

export const getConfig = () => ({ render: "dynamic" as const });
