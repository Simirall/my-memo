"use client";

import { useEffect, useState } from "react";
import { useAppRouter } from "@/components/navigation";
import {
  clearPendingShare,
  readPendingShare,
} from "@/features/sharing/client/share-client";
import {
  getShareDestination,
  type ShareDestination,
} from "@/features/sharing/model/share";

export type ShareQuota = {
  memo: { used: number; limit: number | null };
  aiSummary: { used: number; limit: number | null };
};

type ShareConsumerProps = {
  quota: ShareQuota | null;
};

export default function ShareConsumer({ quota }: ShareConsumerProps) {
  const router = useAppRouter();
  const [error, setError] = useState<string>();
  const [destination, setDestination] = useState<ShareDestination>();

  useEffect(() => {
    const pendingShare = readPendingShare();
    if (!pendingShare) {
      setError("共有内容が見つからないか、有効期限が切れています。");
      return;
    }

    const destination = getShareDestination(pendingShare);
    if (destination.kind === "invalid") {
      clearPendingShare();
      setError("共有内容をメモとして読み込めませんでした。");
      return;
    }

    if (destination.kind === "url") {
      setDestination(destination);
      return;
    }

    void router.replace("/memos/create?shared=1");
  }, [router.replace]);

  const discard = () => {
    clearPendingShare();
    void router.replace("/");
  };

  const memoAvailable =
    quota !== null &&
    (quota.memo.limit === null || quota.memo.used < quota.memo.limit);
  const aiSummaryAvailable =
    memoAvailable &&
    quota !== null &&
    (quota.aiSummary.limit === null ||
      quota.aiSummary.used < quota.aiSummary.limit);

  if (destination?.kind === "url") {
    const sharedUrl = new URL(destination.url);
    const aiSummaryRemaining =
      quota?.aiSummary.limit === null
        ? "無制限"
        : quota
          ? `今月あと${Math.max(
              quota.aiSummary.limit - quota.aiSummary.used,
              0,
            )}回`
          : "確認できません";

    return (
      <div className="flex min-h-[50svh] items-center justify-center p-4 sm:p-8">
        <div className="card bg-base-100 w-full max-w-[32rem] shadow-sm">
          <div className="card-body gap-5">
            <div>
              <h1 className="card-title">このURLをどう保存しますか？</h1>
              <p className="text-base-content/70 mt-2 text-sm">
                共有されたURLをAIで要約するか、通常のメモとして保存できます。
              </p>
            </div>

            <div className="rounded-box border-base-300 bg-base-200 border p-4">
              <p className="text-sm font-semibold">{sharedUrl.host}</p>
              <p className="text-base-content/70 mt-2 text-sm break-all">
                {destination.url}
              </p>
            </div>

            <div className="text-sm">
              <span className="font-semibold">AI要約クォータ:</span>{" "}
              {aiSummaryRemaining}
            </div>

            {quota === null ? (
              <div className="alert alert-error" role="alert">
                プランの上限設定を確認できないため、共有を保存できません。
              </div>
            ) : !memoAvailable ? (
              <div className="alert alert-error" role="alert">
                メモの上限に達しているため、共有を保存できません。
              </div>
            ) : !aiSummaryAvailable ? (
              <div className="alert alert-warning" role="status">
                AI要約の今月の上限に達しています。通常のメモ作成は利用できます。
              </div>
            ) : null}

            <div className="flex flex-col gap-3">
              <button
                className="btn btn-primary btn-block"
                disabled={!aiSummaryAvailable}
                onClick={() =>
                  void router.replace("/memos/url-summary?shared=1")
                }
                type="button"
              >
                AIで要約
              </button>
              <button
                className="btn btn-secondary btn-soft btn-block"
                disabled={!memoAvailable}
                onClick={() => void router.replace("/memos/create?shared=1")}
                type="button"
              >
                メモを作成
              </button>
              <button
                className="btn btn-ghost btn-block"
                onClick={discard}
                type="button"
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[50svh] items-center justify-center p-8">
      <div className="card bg-base-100 w-full max-w-[28rem] shadow-sm">
        <div className="card-body text-center">
          {error ? (
            <div aria-live="polite" className="alert alert-error" role="alert">
              {error}
            </div>
          ) : (
            <>
              <span className="loading loading-spinner loading-lg mx-auto" />
              <p>作成画面を準備しています…</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
