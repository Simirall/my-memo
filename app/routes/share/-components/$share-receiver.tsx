import { useEffect, useState } from "hono/jsx";
import { writePendingShare } from "@/features/sharing/client/share-client";
import type { PendingShare } from "@/features/sharing/model/share";

export default function ShareReceiver({ share }: { share: PendingShare }) {
  const [error, setError] = useState<string>();

  useEffect(() => {
    try {
      writePendingShare(share);
      window.location.replace("/share/consume");
    } catch {
      setError(
        "共有内容を一時保存できませんでした。ブラウザのストレージを有効にして、もう一度共有してください。",
      );
    }
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
              <p>共有内容を準備しています…</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
