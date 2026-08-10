import { useEffect, useMemo, useRef, useState } from "hono/jsx";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  getAttachmentUploadBody,
  type PendingAttachmentUpload,
  prepareAttachmentUpload,
} from "@/features/attachments/client/attachment-upload-client";
import {
  formatAttachmentSize,
  getAttachmentPreviewKind,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS_PER_MEMO,
} from "@/features/attachments/model/attachment-constants";
import type { memoAttachmentsTable } from "@/schema";
import AttachmentImagePreview from "./attachment-image-preview";

type MemoAttachment = typeof memoAttachmentsTable.$inferSelect;
type AttachmentQuota = {
  used: number;
  limit: number | null;
  remaining: number | null;
  maxFileBytes: number;
  maxFilesPerMemo: number;
};
type PendingAttachment = PendingAttachmentUpload;

const setInitialMediaVolume = (element: HTMLMediaElement | null) => {
  if (element) element.volume = 0.25;
};

export default function AttachmentManager({
  memoId,
  initialAttachments = [],
  readOnly = false,
}: {
  memoId: string;
  initialAttachments?: ReadonlyArray<MemoAttachment>;
  readOnly?: boolean;
}) {
  const [attachments, setAttachments] =
    useState<ReadonlyArray<MemoAttachment>>(initialAttachments);
  const [files, setFiles] = useState<ReadonlyArray<PendingAttachment>>([]);
  const [quota, setQuota] = useState<AttachmentQuota | null>(null);
  const [error, setError] = useState<string>();
  const [status, setStatus] = useState<string>();
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingQuota, setIsCheckingQuota] = useState(false);
  const [attachmentToDelete, setAttachmentToDelete] =
    useState<MemoAttachment>();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewOpenerRef = useRef<HTMLButtonElement | null>(null);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const imageAttachments = useMemo(
    () =>
      attachments.filter(
        (attachment) =>
          getAttachmentPreviewKind(attachment.contentType) === "image",
      ),
    [attachments],
  );

  useEffect(() => {
    if (!status) return;
    const timeoutId = window.setTimeout(() => setStatus(undefined), 4_000);
    return () => window.clearTimeout(timeoutId);
  }, [status]);

  const readQuota = async () => {
    const response = await fetch("/api/attachments/quota", {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error("添付容量を取得できませんでした。");
    const nextQuota = (await response.json()) as AttachmentQuota;
    setQuota(nextQuota);
    return nextQuota;
  };

  const selectFiles = async (event: Event) => {
    const input = event.currentTarget as HTMLInputElement;
    const selected = Array.from(input.files ?? []);
    setFiles([]);
    setError(undefined);
    setStatus(undefined);
    if (selected.length === 0) return;

    setIsCheckingQuota(true);
    try {
      const nextQuota = await readQuota();
      const maxFiles = Math.min(
        nextQuota.maxFilesPerMemo,
        MAX_ATTACHMENTS_PER_MEMO,
      );
      if (attachments.length + selected.length > maxFiles) {
        setError(`このメモには添付できるファイルは${maxFiles}件までです。`);
        return;
      }
      const tooLarge = selected.find(
        (file) =>
          file.size > Math.min(nextQuota.maxFileBytes, MAX_ATTACHMENT_BYTES),
      );
      if (tooLarge) {
        setError(`「${tooLarge.name}」は1ファイル25 MiBを超えています。`);
        return;
      }
      const selectedBytes = selected.reduce(
        (total, file) => total + file.size,
        0,
      );
      if (nextQuota.remaining !== null && selectedBytes > nextQuota.remaining) {
        setError("選択したファイルの合計が残りの添付容量を超えています。");
        return;
      }
      const pending: PendingAttachment[] = [];
      for (const file of selected) {
        try {
          pending.push(await prepareAttachmentUpload(file));
        } catch (cause) {
          throw new Error(
            `「${file.name}」の寸法を取得できませんでした。${
              cause instanceof Error ? ` ${cause.message}` : ""
            }`,
          );
        }
      }
      setFiles(pending);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "添付容量を確認できませんでした。",
      );
    } finally {
      setIsCheckingQuota(false);
    }
  };

  const uploadFiles = async () => {
    if (files.length === 0 || error || isCheckingQuota) return;
    setIsLoading(true);
    setError(undefined);
    setStatus(undefined);
    let successCount = 0;
    const failures: string[] = [];

    try {
      for (const pending of files) {
        const file = pending.file;
        const response = await fetch(`/api/memos/${memoId}/attachments`, {
          method: "POST",
          headers: { Accept: "application/json" },
          body: getAttachmentUploadBody(pending),
        });
        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as {
            message?: string;
          };
          failures.push(
            `${file.name}: ${payload.message ?? "アップロードに失敗しました。"}`,
          );
          continue;
        }
        const payload = (await response.json()) as {
          attachment?: MemoAttachment;
          quota?: AttachmentQuota | null;
        };
        const uploadedAttachment = payload.attachment;
        if (uploadedAttachment) {
          setAttachments((current) => [...current, uploadedAttachment]);
        }
        if (payload.quota) setQuota(payload.quota);
        successCount += 1;
      }
    } catch {
      failures.push("通信に失敗しました。もう一度お試しください。");
    } finally {
      setFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setIsLoading(false);
    }

    if (failures.length > 0) {
      setError(failures.join("\n"));
      setStatus(
        successCount > 0 ? `${successCount}件を保存しました。` : undefined,
      );
      return;
    }
    setStatus(`${successCount}件の添付を保存しました。`);
  };

  const deleteAttachment = async (attachment: MemoAttachment) => {
    setIsLoading(true);
    setError(undefined);
    try {
      const response = await fetch(`/api/attachments/${attachment.id}`, {
        method: "DELETE",
        headers: { Accept: "application/json" },
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as {
          message?: string;
        };
        throw new Error(payload.message ?? "添付を削除できませんでした。");
      }
      setAttachments((current) =>
        current.filter((item) => item.id !== attachment.id),
      );
      await readQuota();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "添付を削除できませんでした。",
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <section className="mt-4 space-y-3" data-attachment-manager={memoId}>
      {(!readOnly || attachments.length > 0) && (
        <h3 className="font-semibold">添付ファイル</h3>
      )}
      {attachments.length > 0 && (
        <ul className="space-y-3">
          {attachments.map((attachment) => {
            const previewKind = getAttachmentPreviewKind(
              attachment.contentType,
            );
            const endpoint = `/api/attachments/${attachment.id}`;
            return (
              <li className="rounded-box bg-base-100 p-3" key={attachment.id}>
                <div className="flex items-start justify-between gap-2">
                  <a
                    className="link min-w-0 break-all"
                    download
                    href={endpoint}
                  >
                    {attachment.fileName}
                  </a>
                  {!readOnly && (
                    <button
                      className="btn btn-ghost btn-xs"
                      disabled={isLoading || isCheckingQuota}
                      onClick={() => setAttachmentToDelete(attachment)}
                      type="button"
                    >
                      削除
                    </button>
                  )}
                </div>
                <p className="text-base-content/70 text-sm">
                  {attachment.contentType}・
                  {formatAttachmentSize(attachment.sizeBytes)}
                </p>
                {previewKind === "image" && (
                  <button
                    aria-label={`画像「${attachment.fileName}」を拡大表示`}
                    className="mt-2 block w-full cursor-zoom-in rounded-box focus-visible:outline-2 focus-visible:outline-base-content focus-visible:outline-offset-2"
                    onClick={(event) => {
                      previewOpenerRef.current =
                        event.currentTarget as HTMLButtonElement;
                      setPreviewIndex(
                        imageAttachments.findIndex(
                          (image) => image.id === attachment.id,
                        ),
                      );
                    }}
                    type="button"
                  >
                    <img
                      alt={attachment.fileName}
                      className="mx-auto block h-auto max-h-[min(60dvh,32rem)] w-full max-w-full rounded-box object-contain"
                      height={attachment.mediaHeight ?? undefined}
                      loading="lazy"
                      src={`${endpoint}?variant=thumbnail`}
                      width={attachment.mediaWidth ?? undefined}
                    />
                  </button>
                )}
                {previewKind === "audio" && (
                  <audio
                    className="mt-2 w-full"
                    controls
                    loading="lazy"
                    preload="metadata"
                    ref={setInitialMediaVolume}
                    src={`${endpoint}?preview=1`}
                  >
                    <track
                      kind="captions"
                      label="字幕"
                      src="data:text/vtt,WEBVTT"
                      srcLang="ja"
                    />
                  </audio>
                )}
                {previewKind === "video" && (
                  <video
                    className="mx-auto mt-2 block h-auto max-h-[min(60dvh,32rem)] w-full max-w-full rounded-box object-contain"
                    controls
                    height={attachment.mediaHeight ?? undefined}
                    loading="lazy"
                    preload="metadata"
                    ref={setInitialMediaVolume}
                    src={`${endpoint}?preview=1`}
                    width={attachment.mediaWidth ?? undefined}
                  >
                    <track
                      kind="captions"
                      label="字幕"
                      src="data:text/vtt,WEBVTT"
                      srcLang="ja"
                    />
                  </video>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {!readOnly && (
        <>
          <label
            className="flex flex-col gap-1"
            htmlFor={`attachments-${memoId}`}
          >
            追加するファイル
            <input
              accept="*/*"
              className="file-input w-full"
              disabled={
                isLoading || attachments.length >= MAX_ATTACHMENTS_PER_MEMO
              }
              id={`attachments-${memoId}`}
              multiple
              onChange={selectFiles}
              ref={fileInputRef}
              type="file"
            />
          </label>
          {files.length > 0 && (
            <div className="text-base-content/70 text-sm">
              {files.map((file) => (
                <p key={`${file.file.name}-${file.file.lastModified}`}>
                  {file.file.name}・{formatAttachmentSize(file.file.size)}
                </p>
              ))}
              <button
                className="btn mt-2"
                disabled={isLoading || isCheckingQuota || Boolean(error)}
                onClick={uploadFiles}
                type="button"
              >
                {isLoading ? (
                  <span className="loading loading-spinner" />
                ) : (
                  "添付を保存"
                )}
              </button>
            </div>
          )}
          {quota && (
            <p className="text-base-content/70 text-sm">
              使用量: {formatAttachmentSize(quota.used)} /{" "}
              {quota.limit === null
                ? "無制限"
                : formatAttachmentSize(quota.limit)}
            </p>
          )}
        </>
      )}
      {error && (
        <div
          aria-live="polite"
          className="alert alert-error whitespace-pre-line"
          role="alert"
        >
          {error}
        </div>
      )}
      {status && (
        <div
          aria-live="polite"
          className="alert alert-soft alert-success"
          role="status"
        >
          {status}
        </div>
      )}
      {imageAttachments.length > 0 && (
        <AttachmentImagePreview
          attachments={imageAttachments}
          initialIndex={previewIndex}
          memoId={memoId}
          onClosed={() => {
            setPreviewIndex(null);
            previewOpenerRef.current?.focus();
            previewOpenerRef.current = null;
          }}
        />
      )}
      <ConfirmDialog
        confirmLabel="削除"
        description={
          attachmentToDelete
            ? `「${attachmentToDelete.fileName}」を削除しますか？`
            : ""
        }
        destructive
        onCancel={() => setAttachmentToDelete(undefined)}
        onConfirm={() => {
          const attachment = attachmentToDelete;
          setAttachmentToDelete(undefined);
          if (attachment) void deleteAttachment(attachment);
        }}
        open={Boolean(attachmentToDelete)}
        title="削除の確認"
      />
    </section>
  );
}
