"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { afterDialogCloseAnimation } from "@/components/dialog-close";
import { useAppRouter } from "@/components/navigation";
import { type FileDetail, FileDetailDialog } from "./file-detail-dialog";

export default function FileListController({
  files,
  children,
}: {
  files: ReadonlyArray<FileDetail>;
  children: ReactNode;
}) {
  const router = useAppRouter();
  const [error, setError] = useState<string>();
  const [status, setStatus] = useState<string>();
  const [selectedId, setSelectedId] = useState<string>();
  const [fileToDelete, setFileToDelete] = useState<FileDetail>();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openerRef = useRef<HTMLButtonElement | null>(null);
  const selectedFile = files.find((file) => file.id === selectedId);

  useEffect(() => {
    if (!error && !status) return;
    const timeoutId = window.setTimeout(() => {
      setError(undefined);
      setStatus(undefined);
    }, 4_000);
    return () => window.clearTimeout(timeoutId);
  }, [error, status]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (selectedFile && !dialog?.open) dialog?.showModal();
    else if (!selectedFile && dialog?.open) dialog.close();
  }, [selectedFile]);

  const deleteFile = async (file: FileDetail) => {
    dialogRef.current?.close();
    setError(undefined);
    setStatus("削除しています…");
    try {
      const response = await fetch(
        `/api/attachments/${encodeURIComponent(file.id)}`,
        {
          method: "DELETE",
          headers: { Accept: "application/json" },
        },
      );
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as {
          message?: string;
        };
        throw new Error(payload.message ?? "ファイルを削除できませんでした。");
      }
      setStatus("ファイルを削除しました。");
      try {
        await router.reload();
      } catch {
        setError(
          "削除済みですが表示を更新できませんでした。ページを再読み込みしてください。",
        );
      }
    } catch (cause) {
      setStatus(undefined);
      setError(
        cause instanceof Error
          ? cause.message
          : "ファイルを削除できませんでした。",
      );
    }
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: Delegates native file buttons rendered by the Server Component.
    // biome-ignore lint/a11y/useKeyWithClickEvents: Native buttons provide keyboard activation.
    <div
      onChange={(event) => {
        const select = event.target;
        if (
          !(select instanceof HTMLSelectElement) ||
          !select.hasAttribute("data-file-category-filter")
        )
          return;
        const params = new URLSearchParams();
        if (select.value) params.set("category", select.value);
        void router.push(`/settings/files${params.size ? `?${params}` : ""}`);
      }}
      onClick={(event) => {
        if (!(event.target instanceof Element)) return;
        const button = event.target.closest<HTMLButtonElement>(
          "[data-file-open], [data-file-delete]",
        );
        const file = files.find((file) => file.id === button?.dataset.fileId);
        if (!button || !file) return;
        if (button.hasAttribute("data-file-delete")) setFileToDelete(file);
        else {
          openerRef.current = button;
          if (selectedId === file.id) dialogRef.current?.showModal();
          else setSelectedId(file.id);
        }
      }}
    >
      {children}
      <div
        className="toast toast-end toast-bottom pointer-events-none z-50"
        data-file-list-controller
      >
        {error && (
          <div
            aria-atomic="true"
            aria-live="polite"
            className="alert alert-soft alert-error pointer-events-auto w-[min(24rem,calc(100vw-2rem))] shadow-lg"
            role="alert"
          >
            {error}
          </div>
        )}
        {status && (
          <div
            aria-atomic="true"
            aria-live="polite"
            className="alert alert-soft alert-success pointer-events-auto w-[min(24rem,calc(100vw-2rem))] shadow-lg"
            role="status"
          >
            {status}
          </div>
        )}
      </div>
      <FileDetailDialog
        file={selectedFile}
        onClose={() => {
          const dialog = dialogRef.current;
          if (!dialog) return;
          afterDialogCloseAnimation(dialog, () => {
            setSelectedId(undefined);
            openerRef.current?.focus();
            openerRef.current = null;
          });
        }}
        onDelete={() => setFileToDelete(selectedFile)}
        ref={dialogRef}
      />
      <ConfirmDialog
        confirmLabel="削除"
        description={
          fileToDelete ? `「${fileToDelete.fileName}」を削除しますか？` : ""
        }
        destructive
        onCancel={() => setFileToDelete(undefined)}
        onConfirm={() => {
          const file = fileToDelete;
          setFileToDelete(undefined);
          if (file) void deleteFile(file);
        }}
        open={Boolean(fileToDelete)}
        title="削除の確認"
      />
    </div>
  );
}
