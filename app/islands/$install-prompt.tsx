import infoIcon from "@phosphor-icons/core/assets/regular/info.svg?raw";
import { useEffect, useState } from "hono/jsx";
import { PhosphorIcon } from "../components/phosphor-icon";

type InstallMode = "banner" | "settings";

const DISMISSED_KEY = "my-memo.install-prompt-dismissed";

const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  (window.navigator as Navigator & { standalone?: boolean }).standalone ===
    true;

export default function InstallPrompt({ mode }: { mode: InstallMode }) {
  const [isVisible, setIsVisible] = useState(false);
  const [canPrompt, setCanPrompt] = useState(false);

  useEffect(() => {
    const update = () => {
      if (isStandalone()) {
        setIsVisible(false);
        return;
      }

      const dismissed = window.localStorage.getItem(DISMISSED_KEY) === "1";
      setIsVisible(mode === "settings" || !dismissed);
      setCanPrompt(Boolean(window.__myMemoInstallPrompt));
    };

    update();
    window.addEventListener("my-memo-install-ready", update);
    window.addEventListener("appinstalled", update);
    return () => {
      window.removeEventListener("my-memo-install-ready", update);
      window.removeEventListener("appinstalled", update);
    };
  }, [mode]);

  if (!isVisible) return null;

  const dismiss = () => {
    window.localStorage.setItem(DISMISSED_KEY, "1");
    setIsVisible(false);
  };

  const install = async () => {
    const prompt = window.__myMemoInstallPrompt;
    if (!prompt) return;

    await prompt.prompt();
    const choice = await prompt.userChoice;
    window.__myMemoInstallPrompt = undefined;
    setCanPrompt(false);
    if (choice.outcome === "accepted") {
      setIsVisible(false);
    } else {
      dismiss();
    }
  };

  const content = (
    <div className="min-w-0 flex-1">
      <h3 className="font-bold text-lg">My Memoをアプリとして使う</h3>
      <p className="text-sm">
        インストールすると、端末の共有メニューからMy
        Memoを選んでメモを作成できます。
      </p>
      {!canPrompt && (
        <p className="mt-1 text-base-content text-sm">
          ブラウザのメニューから「アプリをインストール」または「ホーム画面に追加」を選んでください。
        </p>
      )}
    </div>
  );

  const installButton = canPrompt && (
    <button className="btn btn-sm" onClick={install} type="button">
      アプリをインストール
    </button>
  );

  if (mode === "settings") {
    return (
      <section aria-labelledby="install-heading" className="space-y-4">
        <h2 className="font-bold text-lg" id="install-heading">
          アプリをインストール
        </h2>
        <div className="alert alert-info alert-soft alert-vertical sm:alert-horizontal items-center text-base-content">
          <PhosphorIcon
            className="inline-flex shrink-0 text-info [&_svg]:size-6"
            svg={infoIcon}
          />
          {content}
          {installButton}
        </div>
      </section>
    );
  }

  return (
    <div className="pointer-events-none fixed inset-x-4 bottom-4 z-20 sm:inset-x-6">
      <div className="pointer-events-auto mx-auto max-w-5xl">
        <div className="alert alert-info alert-soft alert-vertical sm:alert-horizontal border-base-300 text-base-content shadow-lg">
          <PhosphorIcon
            className="inline-flex shrink-0 text-info [&_svg]:size-6"
            svg={infoIcon}
          />
          {content}
          <div className="flex w-full justify-end gap-2 sm:w-auto">
            {installButton}
            <button
              aria-label="インストール案内を閉じる"
              className="btn btn-ghost btn-sm"
              onClick={dismiss}
              type="button"
            >
              閉じる
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
