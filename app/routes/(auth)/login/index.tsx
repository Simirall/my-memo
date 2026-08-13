import { createRoute } from "honox/factory";
import AccountDeletionComplete from "@/islands/$account-deletion-complete";
import { LoginButton } from "./-components/$login-button";

export default createRoute((c) => {
  const callbackURL = c.req.query("callbackURL");
  const accountDeleted = c.req.query("accountDeleted") === "1";

  return c.render(
    <div className="space-y-8 text-center [&>honox-island]:mx-auto [&>honox-island]:block [&>honox-island]:w-fit">
      <title>ログイン | My Memo</title>
      <h1 className="font-bold text-5xl">My Memo</h1>
      {accountDeleted && <AccountDeletionComplete />}
      <LoginButton callbackURL={callbackURL} />
    </div>,
  );
});
