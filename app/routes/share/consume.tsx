import { createRoute } from "honox/factory";
import ShareConsumer from "../../islands/share-consumer";

export default createRoute((c) => {
  if (!c.get("user")) {
    return c.redirect("/login?callbackURL=%2Fshare%2Fconsume");
  }

  return c.render(
    <div className="w-full [&>honox-island]:block [&>honox-island]:w-full">
      <ShareConsumer />
    </div>,
  );
});
