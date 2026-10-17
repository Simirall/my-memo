"use client";

import trashIcon from "@phosphor-icons/core/assets/regular/trash.svg?raw";
import { useRef, useState } from "react";
import { useAppRouter } from "@/components/navigation";
import { ConfirmDialog } from "../components/confirm-dialog";
import { PhosphorIcon } from "../components/phosphor-icon";

export const DeleteButton = ({
  action,
  className = "btn btn-soft btn-error",
  confirmMessage,
  label = "削除",
}: {
  action: string;
  className?: string;
  confirmMessage?: string;
  label?: string;
}) => {
  const router = useAppRouter();
  const deletedRef = useRef(false);
  const [error, setError] = useState<string>();
  const [isLoading, setIsLoading] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const confirmedRef = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <>
      <form
        action={action}
        className="flex justify-end"
        method="post"
        onSubmit={async (event) => {
          if (confirmMessage && !confirmedRef.current) {
            event.preventDefault();
            setIsConfirming(true);
            return;
          }
          confirmedRef.current = false;
          setIsLoading(true);
          if (action.startsWith("/api/memos/delete/")) {
            event.preventDefault();
            setError(undefined);
            try {
              if (!deletedRef.current) {
                const response = await fetch(action, {
                  method: "POST",
                  body: new FormData(event.currentTarget),
                });
                if (!response.ok)
                  throw new Error("メモを削除できませんでした。");
                deletedRef.current = true;
              }
              try {
                await router.reload();
              } catch {
                setError(
                  "削除済みですが表示を更新できませんでした。ページを再読み込みしてください。",
                );
                return;
              }
            } catch {
              setError(
                "削除結果を確認できませんでした。ページを再読み込みして確認してください。",
              );
            }
          }
        }}
        ref={formRef}
      >
        <button
          aria-label={label}
          className={className}
          disabled={isLoading}
          type="submit"
        >
          {isLoading ? (
            <span className="loading loading-spinner text-error" />
          ) : (
            <PhosphorIcon svg={trashIcon} />
          )}
        </button>
      </form>
      {error && <p role="alert">{error}</p>}
      {confirmMessage && (
        <ConfirmDialog
          confirmLabel="削除"
          description={confirmMessage}
          destructive
          onCancel={() => setIsConfirming(false)}
          onConfirm={() => {
            confirmedRef.current = true;
            setIsConfirming(false);
            formRef.current?.requestSubmit();
          }}
          open={isConfirming}
          title="削除の確認"
        />
      )}
    </>
  );
};
