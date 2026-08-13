import { useEffect, useRef, useState } from "hono/jsx";
import { authClient } from "@/auth/auth-client";
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
      class="modal modal-middle"
      closedby="none"
      onCancel={(event: Event) => event.preventDefault()}
      ref={dialogRef}
    >
      <div class="modal-box">
        <h2 class="font-bold text-lg" id="legal-consent-dialog-title">
          <a
            class="link"
            href="/terms"
            rel="noopener noreferrer"
            target="_blank"
          >
            利用規約
          </a>
          ・
          <a
            class="link"
            href="/privacy"
            rel="noopener noreferrer"
            target="_blank"
          >
            プライバシーポリシー
          </a>
          が改訂されました
        </h2>
        {storageError && (
          <p class="mt-3 text-error text-sm" role="alert">
            同意状態を保存できませんでした。ブラウザの設定を確認してください。
          </p>
        )}
        <div class="modal-action">
          <button
            class="btn"
            disabled={isLoggingOut}
            onClick={logout}
            type="button"
          >
            ログアウト
          </button>
          <button
            class="btn btn-soft btn-primary"
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
