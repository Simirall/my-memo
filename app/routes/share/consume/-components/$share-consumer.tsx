import { useEffect, useState } from "hono/jsx";
import {
  clearPendingShare,
  getShareDestination,
  readPendingShare,
} from "@/routes/-features/sharing";

export default function ShareConsumer() {
  const [error, setError] = useState<string>();

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

    window.location.replace(
      destination.kind === "url-summary"
        ? "/memos/url-summary?shared=1"
        : "/memos/create?shared=1",
    );
  }, []);

  return (
    <div className="flex min-h-[50svh] items-center justify-center p-8">
      <div className="card w-full max-w-[28rem] bg-base-100 shadow-sm">
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
