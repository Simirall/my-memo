import { useEffect, useRef, useState } from "hono/jsx";
import type z from "zod";
import type { categorySchema } from "@/routes/-features/categories";
import {
  clearPendingShare,
  getShareDestination,
  readPendingShare,
  type SharedMemoPrefill,
} from "@/routes/-features/sharing";
import type { ShareIntake } from "@/routes/-features/sharing/share-intake";
import type { Tag } from "@/routes/-features/tags";
import { TagInput } from "@/routes/-features/tags";
import type { MediaDimensions } from "@/utils/attachment-constants";
import {
  formatAttachmentSize,
  getAttachmentPreviewKind,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS_PER_MEMO,
} from "@/utils/attachment-constants";
import {
  readMediaDimensions,
  readMediaDimensionsFromUrl,
} from "@/utils/media-dimensions";

type AttachmentQuota = {
  used: number;
  limit: number | null;
  remaining: number | null;
  maxFileBytes: number;
  maxFilesPerMemo: number;
};
type PendingAttachment = {
  file: File;
  dimensions: MediaDimensions | null;
};

export default function CreateMemoForm({
  categories,
  tags = [],
  error: initialError,
  initialValues,
  shareIntake,
}: {
  categories: ReadonlyArray<z.infer<typeof categorySchema.read>>;
  tags?: ReadonlyArray<Tag>;
  error?: string;
  initialValues?: SharedMemoPrefill;
  shareIntake?: ShareIntake;
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(initialError);
  const [title, setTitle] = useState(initialValues?.title ?? "");
  const [content, setContent] = useState(initialValues?.content ?? "");
  const [url, setUrl] = useState(initialValues?.url ?? "");
  const [shareWarning, setShareWarning] = useState(() =>
    getShareWarning(initialValues),
  );
  const [files, setFiles] = useState<ReadonlyArray<PendingAttachment>>([]);
  const [attachmentQuota, setAttachmentQuota] = useState<AttachmentQuota>();
  const [attachmentError, setAttachmentError] = useState<string>();
  const [attachmentStatus, setAttachmentStatus] = useState<string>();
  const [createdMemoId, setCreatedMemoId] = useState<string>();
  const [isCheckingAttachments, setIsCheckingAttachments] = useState(false);
  const [sharedFiles, setSharedFiles] = useState(shareIntake?.files ?? []);
  const [sharedMediaDimensions, setSharedMediaDimensions] = useState<
    Record<string, MediaDimensions>
  >({});
  const [sharedMediaError, setSharedMediaError] = useState<string>();
  const [isCheckingSharedMedia, setIsCheckingSharedMedia] = useState(
    Boolean(
      shareIntake?.files.some((file) => {
        const kind = getAttachmentPreviewKind(file.contentType);
        return kind === "image" || kind === "video";
      }),
    ),
  );
  const [isRemovingSharedFile, setIsRemovingSharedFile] = useState(false);
  const [isCancellingShare, setIsCancellingShare] = useState(false);
  const sharedMediaAnalysisGeneration = useRef(0);

  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has("shared")) return;

    const pendingShare = readPendingShare();
    if (!pendingShare) return;

    const destination = getShareDestination(pendingShare);
    const prefill =
      destination.kind === "memo"
        ? destination.prefill
        : destination.kind === "url"
          ? destination.memoPrefill
          : undefined;
    if (!prefill) return;

    setTitle(prefill.title);
    setContent(prefill.content);
    setUrl(prefill.url ?? "");
    setShareWarning(getShareWarning(prefill));
    clearPendingShare();
  }, []);

  const analyzeSharedMedia = async () => {
    if (!shareIntake) return;
    const generation = (sharedMediaAnalysisGeneration.current ?? 0) + 1;
    sharedMediaAnalysisGeneration.current = generation;
    const mediaFiles = sharedFiles.filter((file) => {
      const kind = getAttachmentPreviewKind(file.contentType);
      return kind === "image" || kind === "video";
    });
    setIsCheckingSharedMedia(true);
    setSharedMediaError(undefined);
    try {
      const entries = await Promise.all(
        mediaFiles.map(async (file) => {
          const kind = getAttachmentPreviewKind(file.contentType);
          if (kind !== "image" && kind !== "video") return null;
          try {
            const dimensions = await readMediaDimensionsFromUrl(
              `/api/share-intakes/${shareIntake.id}/files/${file.id}`,
              kind,
            );
            return [file.id, dimensions] as const;
          } catch (cause) {
            throw new Error(
              `「${file.fileName}」の寸法を取得できませんでした。${
                cause instanceof Error ? ` ${cause.message}` : ""
              }`,
            );
          }
        }),
      );
      if (generation !== sharedMediaAnalysisGeneration.current) return;
      setSharedMediaDimensions(
        Object.fromEntries(
          entries.filter(
            (entry): entry is readonly [string, MediaDimensions] =>
              entry !== null,
          ),
        ),
      );
    } catch (cause) {
      if (generation !== sharedMediaAnalysisGeneration.current) return;
      setSharedMediaError(
        cause instanceof Error
          ? cause.message
          : "共有ファイルの寸法を取得できませんでした。",
      );
    } finally {
      if (generation === sharedMediaAnalysisGeneration.current)
        setIsCheckingSharedMedia(false);
    }
  };

  useEffect(() => {
    if (!shareIntake) return;
    void analyzeSharedMedia();
    return () => {
      sharedMediaAnalysisGeneration.current =
        (sharedMediaAnalysisGeneration.current ?? 0) + 1;
    };
  }, [shareIntake?.id, sharedFiles]);

  const fetchAttachmentQuota = async () => {
    const response = await fetch("/api/attachments/quota", {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error("添付容量を取得できませんでした。");
    const quota = (await response.json()) as AttachmentQuota;
    setAttachmentQuota(quota);
    return quota;
  };

  const selectFiles = async (event: Event) => {
    const selected = Array.from(
      (event.currentTarget as HTMLInputElement).files ?? [],
    );
    setFiles([]);
    setAttachmentError(undefined);
    setAttachmentStatus(undefined);
    if (selected.length === 0) return;

    setIsCheckingAttachments(true);
    try {
      const quota = await fetchAttachmentQuota();
      const maxFiles = Math.min(
        quota.maxFilesPerMemo,
        MAX_ATTACHMENTS_PER_MEMO,
      );
      if (selected.length > maxFiles) {
        setAttachmentError(`添付できるファイルは${maxFiles}件までです。`);
        return;
      }
      const tooLarge = selected.find(
        (file) =>
          file.size > Math.min(quota.maxFileBytes, MAX_ATTACHMENT_BYTES),
      );
      if (tooLarge) {
        setAttachmentError(
          `「${tooLarge.name}」は1ファイル25 MiBを超えています。`,
        );
        return;
      }
      const totalBytes = selected.reduce((total, file) => total + file.size, 0);
      if (quota.remaining !== null && totalBytes > quota.remaining) {
        setAttachmentError(
          "選択したファイルの合計が残りの添付容量を超えています。",
        );
        return;
      }
      const pending: PendingAttachment[] = [];
      for (const file of selected) {
        try {
          pending.push({
            file,
            dimensions: await readMediaDimensions(
              file,
              getAttachmentPreviewKind(file.type),
            ),
          });
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
      setAttachmentError(
        cause instanceof Error
          ? cause.message
          : "添付容量を確認できませんでした。",
      );
    } finally {
      setIsCheckingAttachments(false);
    }
  };

  const uploadAttachments = async (
    memoId: string,
    pending: ReadonlyArray<PendingAttachment>,
  ) => {
    const failed: PendingAttachment[] = [];
    let succeeded = 0;
    for (const item of pending) {
      const file = item.file;
      try {
        const response = await fetch(`/api/memos/${memoId}/attachments`, {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": file.type || "application/octet-stream",
            "X-File-Size": String(file.size),
            "X-File-Name": encodeURIComponent(file.name),
            ...(item.dimensions
              ? {
                  "X-Media-Width": String(item.dimensions.width),
                  "X-Media-Height": String(item.dimensions.height),
                }
              : {}),
          },
          body: file,
        });
        if (!response.ok) {
          failed.push(item);
          continue;
        }
        const payload = (await response.json()) as {
          quota?: AttachmentQuota | null;
        };
        if (payload.quota) setAttachmentQuota(payload.quota);
        succeeded += 1;
      } catch {
        failed.push(item);
      }
    }
    setFiles(failed);
    return { failed, succeeded };
  };

  const removeSharedFile = async (fileId: string) => {
    if (!shareIntake || isRemovingSharedFile || isLoading) return;
    setIsRemovingSharedFile(true);
    setAttachmentError(undefined);
    try {
      const response = await fetch(
        `/api/share-intakes/${shareIntake.id}/files/${fileId}`,
        { method: "DELETE", headers: { Accept: "application/json" } },
      );
      const payload = (await response.json().catch(() => ({}))) as {
        files?: typeof sharedFiles;
        message?: string;
      };
      if (!response.ok || !payload.files) {
        throw new Error(payload.message ?? "共有ファイルを外せませんでした。");
      }
      setSharedFiles(payload.files);
      setSharedMediaDimensions((current) => {
        const next = { ...current };
        delete next[fileId];
        return next;
      });
    } catch (cause) {
      setAttachmentError(
        cause instanceof Error
          ? cause.message
          : "共有ファイルを外せませんでした。",
      );
    } finally {
      setIsRemovingSharedFile(false);
    }
  };

  const cancelSharedIntake = async () => {
    if (!shareIntake || isCancellingShare || isLoading) return;
    setIsCancellingShare(true);
    setAttachmentError(undefined);
    try {
      const response = await fetch(`/api/share-intakes/${shareIntake.id}`, {
        method: "DELETE",
        headers: { Accept: "application/json" },
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as {
          message?: string;
        };
        throw new Error(
          payload.message ?? "共有内容をキャンセルできませんでした。",
        );
      }
      window.location.assign("/");
    } catch (cause) {
      setAttachmentError(
        cause instanceof Error
          ? cause.message
          : "共有内容をキャンセルできませんでした。",
      );
    } finally {
      setIsCancellingShare(false);
    }
  };

  const retryAttachments = async () => {
    if (!createdMemoId || files.length === 0) return;
    setIsLoading(true);
    setAttachmentError(undefined);
    const result = await uploadAttachments(createdMemoId, files);
    setIsLoading(false);
    if (result.failed.length > 0) {
      setAttachmentError(
        "一部の添付を保存できませんでした。もう一度お試しください。",
      );
      return;
    }
    window.location.assign("/");
  };

  const submit = async (event: Event) => {
    event.preventDefault();
    if (createdMemoId || isCheckingAttachments || isCheckingSharedMedia) return;
    if (attachmentError) return;
    const form = event.currentTarget as HTMLFormElement;
    setError(undefined);
    setIsLoading(true);

    try {
      if (shareIntake) {
        const body = new FormData(form);
        body.set(
          "mediaDimensions",
          JSON.stringify(
            Object.entries(sharedMediaDimensions).map(
              ([fileId, dimensions]) => ({ fileId, ...dimensions }),
            ),
          ),
        );
        const response = await fetch(
          `/api/share-intakes/${shareIntake.id}/finalize`,
          {
            method: "POST",
            body,
            headers: { Accept: "application/json" },
          },
        );
        if (response.ok) {
          window.location.assign("/");
          return;
        }
        const payload = (await response.json().catch(() => ({}))) as {
          message?: string;
        };
        setError(payload.message ?? "共有メモを保存できませんでした。");
        return;
      }

      const response = await fetch(form.action, {
        method: "POST",
        body: new FormData(form),
        headers: { Accept: "application/json" },
      });
      if (response.ok) {
        const payload = (await response.json()) as { memoId?: string };
        if (!payload.memoId) throw new Error("メモIDを取得できませんでした。");
        if (files.length === 0) {
          window.location.assign("/");
          return;
        }

        const result = await uploadAttachments(payload.memoId, files);
        if (result.failed.length > 0) {
          setCreatedMemoId(payload.memoId);
          setAttachmentError(
            "メモは保存されましたが、一部の添付を保存できませんでした。",
          );
          setAttachmentStatus(
            result.succeeded > 0
              ? `${result.succeeded}件の添付を保存しました。残りを再試行してください。`
              : "添付を保存できませんでした。残りを再試行してください。",
          );
          return;
        }
        window.location.assign("/");
        return;
      }
      const payload = (await response.json()) as { message?: string };
      setError(payload.message ?? "メモを保存できませんでした。");
    } catch {
      setError("通信に失敗しました。もう一度お試しください。");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form
      action="/api/memos/create"
      className="flex flex-col gap-4"
      method="post"
      onSubmit={submit}
    >
      {error && (
        <div aria-live="polite" className="alert alert-error" role="alert">
          {error}
        </div>
      )}
      {shareWarning && (
        <div aria-live="polite" className="alert alert-warning" role="status">
          {shareWarning}
        </div>
      )}
      {attachmentError && (
        <div aria-live="polite" className="alert alert-error" role="alert">
          {attachmentError}
        </div>
      )}
      {sharedMediaError && (
        <div aria-live="polite" className="alert alert-error" role="alert">
          {sharedMediaError}
          <button
            className="btn btn-sm"
            disabled={isCheckingSharedMedia || isLoading}
            onClick={() => void analyzeSharedMedia()}
            type="button"
          >
            寸法を再試行
          </button>
        </div>
      )}
      {attachmentStatus && (
        <div aria-live="polite" className="alert alert-warning" role="status">
          {attachmentStatus}
        </div>
      )}
      {shareIntake && (
        <section aria-label="共有ファイル" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">共有ファイル</h2>
            <span className="badge badge-soft badge-info">
              {sharedFiles.length}件
            </span>
          </div>
          {sharedFiles.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {sharedFiles.map((file) => (
                <li
                  className="flex items-center justify-between gap-2 rounded-box bg-base-200 p-3"
                  key={file.id}
                >
                  <span className="min-w-0 break-all text-sm">
                    {file.fileName}・{formatAttachmentSize(file.sizeBytes)}
                  </span>
                  <button
                    className="btn btn-ghost btn-xs"
                    disabled={isLoading || isRemovingSharedFile}
                    onClick={() => removeSharedFile(file.id)}
                    type="button"
                  >
                    外す
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="alert alert-warning" role="status">
              保存する共有ファイルがありません。
            </div>
          )}
          {isCheckingSharedMedia && (
            <p className="text-base-content/70 text-sm" role="status">
              共有mediaの寸法を確認しています…
            </p>
          )}
        </section>
      )}
      <label className="flex flex-col gap-1" htmlFor="memo-title">
        Title
        <input
          className="input w-full!"
          id="memo-title"
          maxLength={255}
          name="title"
          onInput={(event) =>
            setTitle((event.currentTarget as HTMLInputElement).value)
          }
          required
          type="text"
          value={title}
        />
      </label>
      <label className="flex flex-col gap-1" htmlFor="memo-content">
        Content
        <textarea
          className="textarea min-h-40 w-full!"
          id="memo-content"
          maxLength={10000}
          name="content"
          onInput={(event) =>
            setContent((event.currentTarget as HTMLTextAreaElement).value)
          }
          required
          value={content}
        />
      </label>
      <label className="flex flex-col gap-1" htmlFor="memo-url">
        URL (optional)
        <input
          className="input w-full!"
          id="memo-url"
          name="url"
          onInput={(event) =>
            setUrl((event.currentTarget as HTMLInputElement).value)
          }
          type="url"
          value={url}
        />
      </label>
      {categories.length > 0 && (
        <label className="flex flex-col gap-1" htmlFor="memo-category">
          Category
          <select
            className="select w-full!"
            id="memo-category"
            name="categoryId"
          >
            <option value="">Select Category</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="flex flex-col gap-1">
        <label htmlFor="memo-tags">Tags</label>
        <TagInput availableTags={tags} inputId="memo-tags" />
      </div>
      {!shareIntake && (
        <label className="flex flex-col gap-1" htmlFor="memo-attachments">
          添付ファイル（任意）
          <input
            accept="*/*"
            className="file-input w-full"
            disabled={isLoading || Boolean(createdMemoId)}
            id="memo-attachments"
            multiple
            onChange={selectFiles}
            type="file"
          />
          {files.length > 0 && (
            <span className="text-base-content/70 text-sm">
              {files.map(({ file }) => (
                <span
                  className="block"
                  key={`${file.name}-${file.lastModified}`}
                >
                  {file.name}・{formatAttachmentSize(file.size)}
                </span>
              ))}
            </span>
          )}
          {attachmentQuota && (
            <span className="text-base-content/70 text-sm">
              使用量: {formatAttachmentSize(attachmentQuota.used)} /{" "}
              {attachmentQuota.limit === null
                ? "無制限"
                : formatAttachmentSize(attachmentQuota.limit)}
            </span>
          )}
        </label>
      )}
      {createdMemoId && files.length > 0 && (
        <button
          className="btn"
          disabled={isLoading}
          onClick={retryAttachments}
          type="button"
        >
          {isLoading ? (
            <span className="loading loading-spinner" />
          ) : (
            "残りの添付を再試行"
          )}
        </button>
      )}
      <div className="flex gap-2">
        {shareIntake && (
          <button
            className="btn flex-1"
            disabled={isLoading || isCancellingShare}
            onClick={cancelSharedIntake}
            type="button"
          >
            キャンセル
          </button>
        )}
        <button
          aria-label="Create Memo"
          className="btn flex-1"
          disabled={
            isLoading ||
            isCheckingAttachments ||
            isCheckingSharedMedia ||
            Boolean(sharedMediaError) ||
            Boolean(createdMemoId) ||
            (Boolean(shareIntake) && sharedFiles.length === 0)
          }
          type="submit"
        >
          {isLoading ? (
            <span className="loading loading-spinner" />
          ) : shareIntake ? (
            "共有メモを保存"
          ) : (
            "Create Memo"
          )}
        </button>
      </div>
    </form>
  );
}

const getShareWarning = (prefill?: SharedMemoPrefill) => {
  if (!prefill) return undefined;
  if (prefill.titleTruncated && prefill.contentTruncated) {
    return "共有内容が長いため、タイトルを255文字、本文を10,000文字まで切り詰めました。保存前に内容を確認してください。";
  }
  if (prefill.titleTruncated) {
    return "共有タイトルが長いため、255文字まで切り詰めました。保存前に内容を確認してください。";
  }
  if (prefill.contentTruncated) {
    return "共有本文が長いため、10,000文字まで切り詰めました。保存前に内容を確認してください。";
  }
  return undefined;
};
