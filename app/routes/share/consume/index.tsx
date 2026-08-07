import { createRoute } from "honox/factory";
import { getAppDb, getPlanUsage } from "@/utils/authorization";
import ShareConsumer from "./-components/$share-consumer";

export default createRoute(async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.redirect("/login?callbackURL=%2Fshare%2Fconsume");
  }

  const usage = await getPlanUsage(getAppDb(c.env), user.id);

  return c.render(
    <div className="w-full [&>honox-island]:block [&>honox-island]:w-full">
      <ShareConsumer
        quota={
          usage
            ? {
                memo: usage.memo,
                aiSummary: usage.aiSummary,
              }
            : null
        }
      />
    </div>,
  );
});
