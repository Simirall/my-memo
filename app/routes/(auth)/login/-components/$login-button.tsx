import { useEffect, useState } from "hono/jsx";
import { authClient } from "@/auth/auth-client";
import {
  hasStoredCurrentLegalConsent,
  LEGAL_CONSENT_STORAGE_KEY,
} from "@/features/legal/consent";

export const LoginButton = ({ callbackURL }: { callbackURL?: string }) => {
  const [hasConsent, setHasConsent] = useState(false);
  const [storageError, setStorageError] = useState(false);

  useEffect(() => {
    setHasConsent(hasStoredCurrentLegalConsent(window.localStorage));
  }, []);

  const handleLogin = async () => {
    await authClient.signIn.social({
      callbackURL,
      provider: "github",
    });
  };

  const handleConsentChange = (event: Event) => {
    const checked = (event.currentTarget as HTMLInputElement).checked;

    try {
      if (checked) {
        window.localStorage.setItem(
          LEGAL_CONSENT_STORAGE_KEY,
          new Date().toISOString(),
        );
      } else {
        window.localStorage.removeItem(LEGAL_CONSENT_STORAGE_KEY);
      }
      setHasConsent(checked);
      setStorageError(false);
    } catch {
      setHasConsent(false);
      setStorageError(true);
    }
  };

  return (
    <div class="mx-auto grid w-full gap-4 text-left">
      <button
        class="btn mx-auto"
        disabled={!hasConsent}
        onClick={handleLogin}
        type="button"
      >
        GitHubでログイン
      </button>
      <label class="flex cursor-pointer items-start gap-3" for="legal-consent">
        <input
          checked={hasConsent}
          class="checkbox mt-0.5"
          id="legal-consent"
          onChange={handleConsentChange}
          type="checkbox"
        />
        <span>利用規約に同意し、プライバシーポリシーを確認しました</span>
      </label>
      <p class="text-center text-base-content/70 text-sm">
        <a class="link" href="/terms" rel="noopener noreferrer" target="_blank">
          利用規約
        </a>
        <span aria-hidden="true"> ／ </span>
        <a
          class="link"
          href="/privacy"
          rel="noopener noreferrer"
          target="_blank"
        >
          プライバシーポリシー
        </a>
      </p>
      {storageError && (
        <p class="text-error text-sm" role="alert">
          同意状態を保存できませんでした。ブラウザの設定を確認してください。
        </p>
      )}
    </div>
  );
};
