import { createRoute } from "honox/factory";
import {
  getAppDb,
  getPlanUsage,
} from "@/features/access-control/authorization";
import ShareConsumer from "./-components/$share-consumer";

export default createRoute(async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.redirect("/login?callbackURL=%2Fshare%2Fconsume");
  }

  const usage = await getPlanUsage(getAppDb(c.env), user.id);

  return c.render(
    <div className="w-full [&>honox-island]:block [&>honox-island]:w-full">
      <title>共有内容を確認 | My Memo</title>
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
