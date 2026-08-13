import { useEffect, useRef, useState } from "hono/jsx";
import { ConfirmDialog } from "@/components/confirm-dialog";
import type { AccountDeletionStatus } from "@/features/account-deletion/server/account-deletion";

type VisibleStatus = Exclude<AccountDeletionStatus, "complete"> | null;

const clearBrowserData = async () => {
  localStorage.clear();
  sessionStorage.clear();
  if ("caches" in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
  }
};

export default function AccountDeletion({
  initialStatus,
}: {
  initialStatus: VisibleStatus;
}) {
  const [status, setStatus] = useState<VisibleStatus>(initialStatus);
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const activeRef = useRef(true);

  useEffect(() => {
    activeRef.current = true;
    if (status !== "processing") return;
    const poll = async () => {
      try {
        const response = await fetch("/api/account-deletion/status");
        const result = (await response.json()) as {
          status?: AccountDeletionStatus;
          message?: string;
        };
        if (!activeRef.current) return;
        if (result.status === "complete") {
          await clearBrowserData();
          location.replace("/login?accountDeleted=1");
          return;
        }
        if (result.status === "failed") {
          setStatus("failed");
          setMessage(result.message ?? "退会処理に失敗しました。");
        }
      } catch {
        if (activeRef.current)
          setMessage("退会処理の状態を確認できませんでした。");
      }
    };
    void poll();
    const timer = window.setInterval(poll, 5000);
    return () => {
      activeRef.current = false;
      window.clearInterval(timer);
    };
  }, [status]);

  const submit = async (path: string) => {
    setSubmitting(true);
    setMessage(null);
    try {
      const response = await fetch(path, { method: "POST" });
      const result = (await response.json()) as {
        status?: VisibleStatus;
        message?: string;
      };
      if (!response.ok && response.status !== 409)
        throw new Error(result.message);
      setStatus(result.status ?? "processing");
    } catch (error) {
      setMessage(
        error instanceof Error && error.message
          ? error.message
          : "退会処理を開始できませんでした。",
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (status) {
    return (
      <section aria-labelledby="deletion-status-heading" className="space-y-4">
        <h1 className="font-bold text-2xl" id="deletion-status-heading">
          退会処理中
        </h1>
        <div className="alert alert-warning alert-soft" role="status">
          <span>
            {status === "failed"
              ? "ファイルの削除が停止しました。再試行してください。"
              : "すべてのデータを削除しています。この処理は取り消せません。"}
          </span>
        </div>
        {message && (
          <div className="alert alert-error" role="alert">
            <span>{message}</span>
          </div>
        )}
        {status === "processing" ? (
          <span role="status">
            <span aria-hidden="true" className="loading loading-spinner" />
            <span className="sr-only">処理中</span>
          </span>
        ) : (
          <button
            className="btn btn-error"
            disabled={submitting}
            onClick={() => void submit("/api/account-deletion/retry")}
            type="button"
          >
            {submitting ? "再試行しています" : "削除を再試行"}
          </button>
        )}
      </section>
    );
  }

  return (
    <section aria-labelledby="withdrawal-heading" className="space-y-4">
      <div>
        <h2 className="font-bold text-error text-lg" id="withdrawal-heading">
          退会
        </h2>
        <p className="mt-2 text-base-content/80">
          メモ、カテゴリー、タグ、添付ファイル、アカウント情報をすべて削除します。開始後は取り消せません。
        </p>
      </div>
      {message && (
        <div className="alert alert-error" role="alert">
          <span>{message}</span>
        </div>
      )}
      <button
        className="btn btn-soft btn-error"
        disabled={submitting}
        onClick={() => setConfirming(true)}
        type="button"
      >
        退会する
      </button>
      <ConfirmDialog
        confirmLabel="退会する"
        description={
          "自分に紐づくすべてのデータを完全に削除します。\n開始後は取り消せません。"
        }
        destructive
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          void submit("/api/account-deletion");
        }}
        open={confirming}
        title="退会の確認"
      />
    </section>
  );
}
