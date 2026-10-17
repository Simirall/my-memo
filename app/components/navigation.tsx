"use client";

import {
  createContext,
  type ReactNode,
  type RefObject,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { type Link, useRouter } from "waku/router/client";
import { trackHistory } from "./navigation-blocker";

type Href = Extract<Parameters<typeof Link>[0]["to"], string>;
type Retry = () => Promise<void>;
const NavigationContext = createContext<{
  reportFailure: (retry: Retry) => void;
  confirmNavigation: () => boolean;
  blocker: RefObject<() => boolean>;
} | null>(null);

export function NavigationProvider({ children }: { children: ReactNode }) {
  const [retry, setRetry] = useState<Retry>();
  const blocker = useRef(() => false);
  const confirmNavigation = useCallback(
    () =>
      !blocker.current() ||
      window.confirm("保存していない変更があります。破棄して移動しますか？"),
    [],
  );
  useEffect(() => trackHistory(confirmNavigation), [confirmNavigation]);
  const reportFailure = useCallback(
    (retry: Retry) => setRetry(() => retry),
    [],
  );
  const context = useMemo(
    () => ({ reportFailure, confirmNavigation, blocker }),
    [reportFailure, confirmNavigation],
  );
  return (
    <NavigationContext value={context}>
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

export function useNavigationConfirmation() {
  return useContext(NavigationContext)?.confirmNavigation;
}

export function useNavigationBlocker(shouldBlock: () => boolean) {
  const context = useContext(NavigationContext);
  if (!context) throw new Error("Missing NavigationProvider");
  const { blocker } = context;
  useLayoutEffect(() => {
    blocker.current = shouldBlock;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!shouldBlock()) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      blocker.current = () => false;
      window.removeEventListener("beforeunload", beforeUnload);
    };
  }, [blocker, shouldBlock]);
}

export function useAppRouter() {
  const router = useRouter();
  const context = useContext(NavigationContext);
  if (!context) throw new Error("Missing NavigationProvider");
  const { reportFailure, confirmNavigation } = context;
  const navigate = useCallback(
    (to: string, replace: boolean) => {
      if (!confirmNavigation()) return Promise.resolve();
      const retry = () =>
        replace ? router.replace(to as Href) : router.push(to as Href);
      return retry().catch(() => {
        reportFailure(retry);
      });
    },
    [router.push, router.replace, reportFailure, confirmNavigation],
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
