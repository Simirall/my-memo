import { useEffect, useRef, useState } from "hono/jsx";
import type z from "zod";
import {
  getAttachmentUploadBody,
  type PendingAttachmentUpload,
  prepareAttachmentUpload,
} from "@/features/attachments/client/attachment-upload-client";
import {
  type ClipboardRejection,
  formatClipboardRejections,
  getClipboardFiles,
  hasSupportedClipboardMedia,
  selectClipboardMedia,
  shouldCaptureClipboardPaste,
} from "@/features/attachments/client/clipboard-media";
import type { GeneratedThumbnail } from "@/features/attachments/client/image-thumbnail";
import { readMediaDimensionsFromUrl } from "@/features/attachments/client/media-dimensions";
import type { MediaDimensions } from "@/features/attachments/model/attachment-constants";
import {
  formatAttachmentSize,
  getAttachmentPreviewKind,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS_PER_MEMO,
} from "@/features/attachments/model/attachment-constants";
import type { categorySchema } from "@/features/categories/schema/category-schema";
import { getCreatedMemoListPath } from "@/features/memos/input/memo-create-navigation";
import { useFormSubmitShortcut } from "@/features/memos/input/use-form-submit-shortcut";
import {
  clearPendingShare,
  readPendingShare,
} from "@/features/sharing/client/share-client";
import type { ShareIntake } from "@/features/sharing/intake/share-intake";
import {
  getShareDestination,
  type SharedMemoPrefill,
} from "@/features/sharing/model/share";
import type { Tag, TagSuggestions } from "@/features/tags/data/tags";
import { TagInput } from "@/features/tags/input/tag-input";

type AttachmentQuota = {
  used: number;
  limit: number | null;
  remaining: number | null;
  maxFileBytes: number;
  maxFilesPerMemo: number;
};
type PendingAttachment = PendingAttachmentUpload & { id: string };
type SharedPreparedMedia = {
  dimensions: MediaDimensions;
  thumbnail: GeneratedThumbnail | null;
};

export default function CreateMemoForm({
  categories,
  tags = [],
  error: initialError,
  initialCategoryId,
  initialValues,
  shareIntake,
  tagSuggestions = { all: [], byCategory: {} },
}: {
  categories: ReadonlyArray<
    Pick<z.infer<typeof categorySchema.read>, "id" | "name">
  >;
  tags?: ReadonlyArray<Tag>;
  error?: string;
  initialCategoryId?: string;
  initialValues?: SharedMemoPrefill;
  shareIntake?: ShareIntake;
  tagSuggestions?: TagSuggestions;
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(initialError);
  const [title, setTitle] = useState(initialValues?.title ?? "");
  const [content, setContent] = useState(initialValues?.content ?? "");
  const [url, setUrl] = useState(initialValues?.url ?? "");
  const [categoryId, setCategoryId] = useState(initialCategoryId ?? "");
  const [shareWarning, setShareWarning] = useState(() =>
    getShareWarning(initialValues),
  );
  const [files, setFiles] = useState<ReadonlyArray<PendingAttachment>>([]);
  const [attachmentQuota, setAttachmentQuota] = useState<AttachmentQuota>();
  const [attachmentError, setAttachmentError] = useState<string>();
  const [attachmentStatus, setAttachmentStatus] = useState<string>();
  const [createdMemoId, setCreatedMemoId] = useState<string>();
  const [createdMemoCategoryId, setCreatedMemoCategoryId] = useState("");
  const [isCheckingAttachments, setIsCheckingAttachments] = useState(false);
  const [sharedFiles, setSharedFiles] = useState(shareIntake?.files ?? []);
  const [sharedMediaDimensions, setSharedMediaDimensions] = useState<
    Record<string, MediaDimensions>
  >({});
  const [sharedThumbnails, setSharedThumbnails] = useState<
    Record<string, GeneratedThumbnail>
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
  const formRef = useRef<HTMLFormElement>(null);
  const contentRef = useRef<HTMLTextAreaElement>(null);
  const clipboardPasteBusyRef = useRef(false);
  const clipboardPasteHandlerRef = useRef<
    ((event: ClipboardEvent) => Promise<void>) | undefined
  >(undefined);

  useFormSubmitShortcut(
    formRef,
    isLoading ||
      isCheckingAttachments ||
      isCheckingSharedMedia ||
      Boolean(sharedMediaError) ||
      Boolean(createdMemoId) ||
      (Boolean(shareIntake) && sharedFiles.length === 0),
  );

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
            const endpoint = `/api/share-intakes/${shareIntake.id}/files/${file.id}`;
            if (kind === "video") {
              return [
                file.id,
                {
                  dimensions: await readMediaDimensionsFromUrl(endpoint, kind),
                  thumbnail: null,
                },
              ] as const;
            }
            const response = await fetch(endpoint);
            if (!response.ok)
              throw new Error("共有ファイルを取得できませんでした。");
            const source = new File([await response.blob()], file.fileName, {
              type: file.contentType,
            });
            const prepared = await prepareAttachmentUpload(source);
            if (!prepared.dimensions)
              throw new Error("共有画像の寸法を取得できませんでした。");
            return [
              file.id,
              {
                dimensions: prepared.dimensions,
                thumbnail: prepared.thumbnail,
              },
            ] as const;
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
      const preparedEntries = entries.filter(
        (entry): entry is readonly [string, SharedPreparedMedia] =>
          entry !== null,
      );
      setSharedMediaDimensions(
        Object.fromEntries(
          preparedEntries.flatMap(([id, prepared]) =>
            prepared.dimensions ? [[id, prepared.dimensions] as const] : [],
          ),
        ),
      );
      setSharedThumbnails(
        Object.fromEntries(
          preparedEntries.flatMap(([id, prepared]) =>
            prepared.thumbnail ? [[id, prepared.thumbnail] as const] : [],
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

  const handleClipboardPaste = async (event: ClipboardEvent) => {
    if (
      shareIntake ||
      createdMemoId ||
      isLoading ||
      clipboardPasteBusyRef.current ||
      !shouldCaptureClipboardPaste(event, contentRef.current)
    )
      return;

    const selected = getClipboardFiles(event);
    if (selected.length === 0 || !hasSupportedClipboardMedia(selected)) return;

    event.preventDefault();
    clipboardPasteBusyRef.current = true;
    setAttachmentError(undefined);
    setAttachmentStatus(undefined);
    setIsCheckingAttachments(true);
    try {
      const quota = await fetchAttachmentQuota();
      const maxFiles = Math.min(
        quota.maxFilesPerMemo,
        MAX_ATTACHMENTS_PER_MEMO,
      );
      const currentBytes = files.reduce(
        (total, pending) => total + pending.file.size,
        0,
      );
      const selection = selectClipboardMedia(selected, {
        currentCount: files.length,
        currentBytes,
        maxFiles,
        maxFileBytes: Math.min(quota.maxFileBytes, MAX_ATTACHMENT_BYTES),
        availableBytes: quota.remaining,
      });
      const pending: PendingAttachment[] = [];
      const dimensionFailures: ClipboardRejection[] = [];
      for (const file of selection.accepted) {
        try {
          pending.push({
            id: crypto.randomUUID(),
            ...(await prepareAttachmentUpload(file)),
          });
        } catch {
          dimensionFailures.push({ file, reason: "dimensions" });
        }
      }
      const rejected = [...selection.rejected, ...dimensionFailures];
      setFiles((current) => [...current, ...pending]);
      const details = formatClipboardRejections(rejected);
      setAttachmentStatus(
        pending.length > 0
          ? `${pending.length}件のメディアを追加しました。${
              details ? `（${details}）` : ""
            }`
          : `貼り付けたメディアを追加できませんでした。${
              details ? `（${details}）` : ""
            }`,
      );
    } catch (cause) {
      setAttachmentError(
        cause instanceof Error
          ? cause.message
          : "添付容量を確認できませんでした。",
      );
    } finally {
      clipboardPasteBusyRef.current = false;
      setIsCheckingAttachments(false);
    }
  };

  clipboardPasteHandlerRef.current = handleClipboardPaste;

  useEffect(() => {
    const form = formRef.current;
    if (shareIntake || !form) return;
    const onPaste = (event: ClipboardEvent) => {
      if (!form.isConnected) return;
      void clipboardPasteHandlerRef.current?.(event);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [Boolean(shareIntake)]);

  const selectFiles = async (event: Event) => {
    const input = event.currentTarget as HTMLInputElement;
    const selected = Array.from(input.files ?? []);
    input.value = "";
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
      if (files.length + selected.length > maxFiles) {
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
      const totalBytes =
        files.reduce((total, pending) => total + pending.file.size, 0) +
        selected.reduce((total, file) => total + file.size, 0);
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
            id: crypto.randomUUID(),
            ...(await prepareAttachmentUpload(file)),
          });
        } catch (cause) {
          throw new Error(
            `「${file.name}」の寸法を取得できませんでした。${
              cause instanceof Error ? ` ${cause.message}` : ""
            }`,
          );
        }
      }
      setFiles((current) => [...current, ...pending]);
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

  const removeFile = (id: string) => {
    setFiles((current) => current.filter((pending) => pending.id !== id));
  };

  const uploadAttachments = async (
    memoId: string,
    pending: ReadonlyArray<PendingAttachment>,
  ) => {
    const failed: PendingAttachment[] = [];
    let succeeded = 0;
    for (const item of pending) {
      try {
        const response = await fetch(`/api/memos/${memoId}/attachments`, {
          method: "POST",
          headers: { Accept: "application/json" },
          body: getAttachmentUploadBody(item),
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
      setSharedThumbnails((current) => {
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
    window.location.assign(
      getCreatedMemoListPath(createdMemoCategoryId, initialCategoryId),
    );
  };

  const submit = async (event: Event) => {
    event.preventDefault();
    if (createdMemoId || isCheckingAttachments || isCheckingSharedMedia) return;
    if (attachmentError) return;
    const form = event.currentTarget as HTMLFormElement;
    const createdCategoryId = String(
      new FormData(form).get("categoryId") ?? "",
    );
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
        for (const [fileId, thumbnail] of Object.entries(sharedThumbnails)) {
          const extension =
            thumbnail.blob.type === "image/avif" ? "avif" : "webp";
          body.append("thumbnails", thumbnail.blob, `${fileId}.${extension}`);
        }
        body.set(
          "thumbnailFileIds",
          JSON.stringify(Object.keys(sharedThumbnails)),
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
          window.location.assign(
            getCreatedMemoListPath(createdCategoryId, initialCategoryId),
          );
          return;
        }

        const result = await uploadAttachments(payload.memoId, files);
        if (result.failed.length > 0) {
          setCreatedMemoId(payload.memoId);
          setCreatedMemoCategoryId(createdCategoryId);
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
        window.location.assign(
          getCreatedMemoListPath(createdCategoryId, initialCategoryId),
        );
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
      onPaste={handleClipboardPaste}
      onSubmit={submit}
      ref={formRef}
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
              共有された画像や動画の寸法を確認しています…
            </p>
          )}
        </section>
      )}
      <fieldset className="fieldset">
        <label className="fieldset-legend" htmlFor="memo-title">
          タイトル
          <span aria-hidden="true" className="text-error">
            *
          </span>
        </label>
        <input
          className="input w-full!"
          id="memo-title"
          maxLength={255}
          name="title"
          onInput={(event) =>
            setTitle((event.currentTarget as HTMLInputElement).value)
          }
          placeholder="メモのタイトルを入力"
          required
          type="text"
          value={title}
        />
      </fieldset>
      <fieldset className="fieldset">
        <label className="fieldset-legend" htmlFor="memo-content">
          本文
        </label>
        <textarea
          aria-describedby="memo-content-help"
          className="textarea min-h-40 w-full!"
          id="memo-content"
          maxLength={10000}
          name="content"
          onInput={(event) =>
            setContent((event.currentTarget as HTMLTextAreaElement).value)
          }
          placeholder="メモの内容を入力"
          ref={contentRef}
          value={content}
        />
        <p className="label" id="memo-content-help">
          Markdownで入力できます。
        </p>
      </fieldset>
      <fieldset className="fieldset">
        <label className="fieldset-legend" htmlFor="memo-url">
          関連URL
        </label>
        <input
          className="input w-full!"
          id="memo-url"
          name="url"
          onInput={(event) =>
            setUrl((event.currentTarget as HTMLInputElement).value)
          }
          placeholder="https://example.com"
          type="url"
          value={url}
        />
      </fieldset>
      {categories.length > 0 && (
        <fieldset className="fieldset">
          <label className="fieldset-legend" htmlFor="memo-category">
            カテゴリー
          </label>
          <select
            className="select category-select w-full!"
            id="memo-category"
            name="categoryId"
            onChange={(event) =>
              setCategoryId((event.currentTarget as HTMLSelectElement).value)
            }
            value={categoryId}
          >
            <option value="">カテゴリーなし</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </fieldset>
      )}
      <fieldset className="fieldset">
        <label className="fieldset-legend" htmlFor="memo-tags">
          タグ
        </label>
        <TagInput
          availableTags={tags}
          inputId="memo-tags"
          suggestedTags={
            categoryId
              ? (tagSuggestions.byCategory[categoryId] ?? [])
              : tagSuggestions.all
          }
        />
      </fieldset>
      {!shareIntake && (
        <section className="space-y-3">
          <h2 className="font-semibold">添付ファイル</h2>
          {files.length > 0 && (
            <div className="space-y-2 rounded-box border border-base-300 bg-base-100 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-semibold">追加予定</h3>
                <span className="badge badge-soft badge-info">
                  保存時にアップロード
                </span>
              </div>
              <ul className="space-y-2 text-sm">
                {files.map(({ id, file }) => (
                  <li
                    className="flex items-center justify-between gap-2"
                    key={id}
                  >
                    <span className="break-all">
                      {file.name}・{formatAttachmentSize(file.size)}
                    </span>
                    <button
                      className="btn btn-ghost btn-xs"
                      disabled={isLoading}
                      onClick={() => removeFile(id)}
                      type="button"
                    >
                      取り消す
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {attachmentStatus && (
            <div
              aria-live="polite"
              className="alert alert-soft alert-success"
              role="status"
            >
              {attachmentStatus}
            </div>
          )}
          <label className="flex flex-col gap-1" htmlFor="memo-attachments">
            追加するファイル
            <input
              accept="*/*"
              className="file-input w-full"
              disabled={
                isLoading || isCheckingAttachments || Boolean(createdMemoId)
              }
              id="memo-attachments"
              multiple
              onChange={selectFiles}
              type="file"
            />
          </label>
          {attachmentQuota && (
            <p className="text-base-content/70 text-sm">
              使用量: {formatAttachmentSize(attachmentQuota.used)} /{" "}
              {attachmentQuota.limit === null
                ? "無制限"
                : formatAttachmentSize(attachmentQuota.limit)}
            </p>
          )}
        </section>
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
          aria-label="メモを作成"
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
            "メモを作成"
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
