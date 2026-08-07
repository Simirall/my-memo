import { useEffect, useState } from "hono/jsx";
import type z from "zod";
import type { categorySchema } from "@/routes/-features/categories";
import {
  clearPendingShare,
  getShareDestination,
  readPendingShare,
  type SharedMemoPrefill,
} from "@/routes/-features/sharing";
import type { Tag } from "@/routes/-features/tags";
import { TagInput } from "@/routes/-features/tags";
import {
  formatAttachmentSize,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS_PER_MEMO,
} from "@/utils/attachment-constants";

type AttachmentQuota = {
  used: number;
  limit: number | null;
  remaining: number | null;
  maxFileBytes: number;
  maxFilesPerMemo: number;
};

export default function CreateMemoForm({
  categories,
  tags = [],
  error: initialError,
  initialValues,
}: {
  categories: ReadonlyArray<z.infer<typeof categorySchema.read>>;
  tags?: ReadonlyArray<Tag>;
  error?: string;
  initialValues?: SharedMemoPrefill;
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(initialError);
  const [title, setTitle] = useState(initialValues?.title ?? "");
  const [content, setContent] = useState(initialValues?.content ?? "");
  const [url, setUrl] = useState(initialValues?.url ?? "");
  const [shareWarning, setShareWarning] = useState(() =>
    getShareWarning(initialValues),
  );
  const [files, setFiles] = useState<ReadonlyArray<File>>([]);
  const [attachmentQuota, setAttachmentQuota] = useState<AttachmentQuota>();
  const [attachmentError, setAttachmentError] = useState<string>();
  const [attachmentStatus, setAttachmentStatus] = useState<string>();
  const [createdMemoId, setCreatedMemoId] = useState<string>();
  const [isCheckingAttachments, setIsCheckingAttachments] = useState(false);

  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has("shared")) return;

    const pendingShare = readPendingShare();
    if (!pendingShare) return;

    const destination = getShareDestination(pendingShare);
    if (destination.kind !== "memo") return;

    setTitle(destination.prefill.title);
    setContent(destination.prefill.content);
    setUrl(destination.prefill.url ?? "");
    setShareWarning(getShareWarning(destination.prefill));
    clearPendingShare();
  }, []);

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
    setFiles(selected);
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
      }
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
    pending: ReadonlyArray<File>,
  ) => {
    const failed: File[] = [];
    let succeeded = 0;
    for (const file of pending) {
      try {
        const response = await fetch(`/api/memos/${memoId}/attachments`, {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": file.type || "application/octet-stream",
            "X-File-Size": String(file.size),
            "X-File-Name": encodeURIComponent(file.name),
          },
          body: file,
        });
        if (!response.ok) {
          failed.push(file);
          continue;
        }
        const payload = (await response.json()) as {
          quota?: AttachmentQuota | null;
        };
        if (payload.quota) setAttachmentQuota(payload.quota);
        succeeded += 1;
      } catch {
        failed.push(file);
      }
    }
    setFiles(failed);
    return { failed, succeeded };
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
    if (createdMemoId || isCheckingAttachments) return;
    if (attachmentError) return;
    const form = event.currentTarget as HTMLFormElement;
    setError(undefined);
    setIsLoading(true);

    try {
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
      {attachmentStatus && (
        <div aria-live="polite" className="alert alert-warning" role="status">
          {attachmentStatus}
        </div>
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
            {files.map((file) => (
              <span className="block" key={`${file.name}-${file.lastModified}`}>
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
      <button
        aria-label="Create Memo"
        className="btn"
        disabled={isLoading || isCheckingAttachments || Boolean(createdMemoId)}
        type="submit"
      >
        {isLoading ? (
          <span className="loading loading-spinner" />
        ) : (
          "Create Memo"
        )}
      </button>
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
