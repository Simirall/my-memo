"use client";

import { useEffect, useState } from "react";
import { authClient } from "@/auth/auth-client";
import { AppLink } from "@/components/app-link";
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

  const handleConsentChange = (event: React.ChangeEvent<HTMLInputElement>) => {
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
    <div className="mx-auto grid w-full gap-4 text-left">
      <button
        className="btn mx-auto"
        disabled={!hasConsent}
        onClick={handleLogin}
        type="button"
      >
        GitHubでログイン
      </button>
      <label
        className="flex cursor-pointer items-start gap-3"
        htmlFor="legal-consent"
      >
        <input
          checked={hasConsent}
          className="checkbox mt-0.5"
          id="legal-consent"
          onChange={handleConsentChange}
          type="checkbox"
        />
        <span>利用規約に同意し、プライバシーポリシーを確認しました</span>
      </label>
      <p className="text-center text-base-content/70 text-sm">
        <AppLink
          className="link"
          href="/terms"
          rel="noopener noreferrer"
          target="_blank"
        >
          利用規約
        </AppLink>
        <span aria-hidden="true"> ／ </span>
        <AppLink
          className="link"
          href="/privacy"
          rel="noopener noreferrer"
          target="_blank"
        >
          プライバシーポリシー
        </AppLink>
      </p>
      {storageError && (
        <p className="text-error text-sm" role="alert">
          同意状態を保存できませんでした。ブラウザの設定を確認してください。
        </p>
      )}
    </div>
  );
};
