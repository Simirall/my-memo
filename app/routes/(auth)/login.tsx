import { createRoute } from "honox/factory";
import { LoginButton } from "../../islands/login";

export default createRoute((c) => {
  const callbackURL = c.req.query("callbackURL");

  return c.render(
    <div className="space-y-8 text-center">
      <h1 className="font-bold text-5xl">My Memo</h1>
      <LoginButton callbackURL={callbackURL} />
    </div>,
  );
});
