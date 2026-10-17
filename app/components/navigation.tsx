"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { type Link, useRouter } from "waku/router/client";

type Href = Extract<Parameters<typeof Link>[0]["to"], string>;
const FAILURE_EVENT = "my-memo:navigation-failed";

export function useAppRouter() {
  const router = useRouter();
  const navigate = useCallback(
    (to: string, replace: boolean) => {
      const retry = () =>
        replace ? router.replace(to as Href) : router.push(to as Href);
      return retry().catch(() => {
        window.dispatchEvent(new CustomEvent(FAILURE_EVENT, { detail: retry }));
      });
    },
    [router.push, router.replace],
  );
  const push = useCallback((to: string) => navigate(to, false), [navigate]);
  const replace = useCallback((to: string) => navigate(to, true), [navigate]);
  return {
    ...router,
    push,
    replace,
  };
}

export function NavigationFailure() {
  const [retry, setRetry] = useState<() => Promise<void>>();
  const [busy, setBusy] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const onFailure = (event: Event) => {
      setRetry(() => (event as CustomEvent<() => Promise<void>>).detail);
    };
    window.addEventListener(FAILURE_EVENT, onFailure);
    return () => window.removeEventListener(FAILURE_EVENT, onFailure);
  }, []);
  useEffect(() => {
    if (retry) dialog.current?.showModal();
    else dialog.current?.close();
  }, [retry]);
  return (
    <dialog
      aria-label="画面更新の再試行"
      className="modal"
      onCancel={(event) => event.preventDefault()}
      ref={dialog}
    >
      <div className="modal-box space-y-4">
        <p role="alert">
          画面を表示できませんでした。入力内容は保持されています。保存後の場合、保存処理は再送せず画面だけを更新します。
        </p>
        <button
          className="btn"
          disabled={busy}
          onClick={async () => {
            if (!retry) return;
            setBusy(true);
            try {
              await retry();
              setRetry(undefined);
            } catch {
            } finally {
              setBusy(false);
            }
          }}
          type="button"
        >
          画面を再取得
        </button>
      </div>
    </dialog>
  );
}
