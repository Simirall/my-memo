import {
  getAppDb,
  getPlanUsage,
} from "@/features/access-control/authorization";
import ShareConsumer from "@/routes/share/consume/-components/$share-consumer";
import { getRequestContext, redirect } from "@/server/request-context";

export default async function Page() {
  const c = getRequestContext();
  const user = c.get("user");
  if (!user) {
    return redirect("/login?callbackURL=%2Fshare%2Fconsume");
  }

  const usage = await getPlanUsage(getAppDb(c.env), user.id);

  return (
    <div className="w-full">
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
    </div>
  );
}

export const getConfig = () => ({ render: "dynamic" as const });
