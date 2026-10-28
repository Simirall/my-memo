"use client";

import { useEffect, useRef, useState } from "react";
import { authClient } from "@/auth/auth-client";
import { AppLink } from "@/components/app-link";
import {
  hasStoredCurrentLegalConsent,
  LEGAL_CONSENT_STORAGE_KEY,
} from "@/features/legal/consent";

const LegalConsentDialog = () => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [needsConsent, setNeedsConsent] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    setNeedsConsent(!hasStoredCurrentLegalConsent(window.localStorage));
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (needsConsent && dialog?.isConnected && !dialog.open) {
      dialog.showModal();
    }
  }, [needsConsent]);

  const accept = () => {
    try {
      window.localStorage.setItem(
        LEGAL_CONSENT_STORAGE_KEY,
        new Date().toISOString(),
      );
      setStorageError(false);
      setNeedsConsent(false);
      dialogRef.current?.close();
    } catch {
      setStorageError(true);
    }
  };

  const logout = async () => {
    setIsLoggingOut(true);
    await authClient.signOut({
      fetchOptions: {
        onSuccess: () => location.assign("/login"),
      },
    });
    setIsLoggingOut(false);
  };

  return (
    <dialog
      aria-labelledby="legal-consent-dialog-title"
      className="modal modal-middle"
      closedby="none"
      onCancel={(event) => event.preventDefault()}
      ref={dialogRef}
    >
      <div className="modal-box">
        <h2 className="text-lg font-bold" id="legal-consent-dialog-title">
          <AppLink
            className="link"
            href="/terms"
            rel="noopener noreferrer"
            target="_blank"
          >
            利用規約
          </AppLink>
          ・
          <AppLink
            className="link"
            href="/privacy"
            rel="noopener noreferrer"
            target="_blank"
          >
            プライバシーポリシー
          </AppLink>
          が改訂されました
        </h2>
        {storageError && (
          <p className="text-error mt-3 text-sm" role="alert">
            同意状態を保存できませんでした。ブラウザの設定を確認してください。
          </p>
        )}
        <div className="modal-action">
          <button
            className="btn"
            disabled={isLoggingOut}
            onClick={logout}
            type="button"
          >
            ログアウト
          </button>
          <button
            className="btn btn-soft btn-primary"
            onClick={accept}
            type="button"
          >
            同意して続ける
          </button>
        </div>
      </div>
    </dialog>
  );
};

export default LegalConsentDialog;
