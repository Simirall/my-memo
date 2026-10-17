"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { type Link, useRouter } from "waku/router/client";

type Href = Extract<Parameters<typeof Link>[0]["to"], string>;
type Retry = () => Promise<void>;
const NavigationContext = createContext<((retry: Retry) => void) | null>(null);

export function NavigationProvider({ children }: { children: ReactNode }) {
  const [retry, setRetry] = useState<Retry>();
  const reportFailure = useCallback(
    (retry: Retry) => setRetry(() => retry),
    [],
  );
  return (
    <NavigationContext value={reportFailure}>
      {children}
      {retry && (
        <NavigationFailure
          onResolved={() => setRetry(undefined)}
          retry={retry}
        />
      )}
    </NavigationContext>
  );
}

export function useAppRouter() {
  const router = useRouter();
  const reportFailure = useContext(NavigationContext);
  if (!reportFailure) throw new Error("Missing NavigationProvider");
  const navigate = useCallback(
    (to: string, replace: boolean) => {
      const retry = () =>
        replace ? router.replace(to as Href) : router.push(to as Href);
      return retry().catch(() => {
        reportFailure(retry);
      });
    },
    [router.push, router.replace, reportFailure],
  );
  const push = useCallback((to: string) => navigate(to, false), [navigate]);
  const replace = useCallback((to: string) => navigate(to, true), [navigate]);
  return {
    ...router,
    push,
    replace,
  };
}

function NavigationFailure({
  retry,
  onResolved,
}: {
  retry: Retry;
  onResolved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
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
            setBusy(true);
            try {
              await retry();
              onResolved();
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
