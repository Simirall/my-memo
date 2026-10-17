import {
  getAppDb,
  getPlanUsage,
} from "@/features/access-control/authorization";
import { formatAttachmentSize } from "@/features/attachments/model/attachment-constants";
import { SettingsLayout } from "@/routes/settings/-components/settings-layout";
import { getRequestContext, redirect } from "@/server/request-context";

const formatLimit = (limit: number | null) =>
  limit === null ? "無制限" : String(limit);

export default async function Page() {
  const c = getRequestContext();
  const user = c.get("user");
  if (!user) return redirect("/login");

  const db = getAppDb(c.env);
  const usage = await getPlanUsage(db, user.id);

  if (!usage) {
    throw new Error("プランの上限設定が不足しています。");
  }

  return (
    <SettingsLayout activeSection="plan">
      <title>プラン | My Memo</title>
      <div className="space-y-6">
        <div>
          <h1 className="font-bold text-2xl">プラン</h1>
          <p className="text-base-content/70">現在の利用プランと使用量</p>
        </div>
        <div className="card bg-base-100 shadow">
          <div className="card-body">
            <h2 className="card-title">{usage.planName}</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-box bg-base-200 p-4">
                <p className="font-semibold">保存メモ</p>
                <p className="text-2xl">
                  {usage.memo.used} / {formatLimit(usage.memo.limit)}
                </p>
              </div>
              <div className="rounded-box bg-base-200 p-4">
                <p className="font-semibold">AIサジェスト（UTC月次）</p>
                <p className="text-2xl">
                  {usage.aiSuggestion.used} /{" "}
                  {formatLimit(usage.aiSuggestion.limit)}
                </p>
                <p className="text-base-content/70 text-sm">
                  期間開始: {usage.aiSummaryPeriod}
                </p>
              </div>
              <div className="rounded-box bg-base-200 p-4">
                <p className="font-semibold">添付ストレージ</p>
                <p className="text-2xl">
                  {formatAttachmentSize(usage.attachmentStorage.used)} /{" "}
                  {usage.attachmentStorage.limit === null
                    ? "無制限"
                    : formatAttachmentSize(usage.attachmentStorage.limit)}
                </p>
              </div>
              <div className="rounded-box bg-base-200 p-4">
                <p className="font-semibold">AI要約（UTC月次）</p>
                <p className="text-2xl">
                  {usage.aiSummary.used} / {formatLimit(usage.aiSummary.limit)}
                </p>
                <p className="text-base-content/70 text-sm">
                  期間開始: {usage.aiSummaryPeriod}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </SettingsLayout>
  );
}

export const getConfig = () => ({ render: "dynamic" as const });
