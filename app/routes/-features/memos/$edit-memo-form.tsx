import { useEffect, useRef, useState } from "hono/jsx";
import type z from "zod";
import type { categorySchema } from "@/routes/-features/categories";
import type { Tag } from "@/routes/-features/tags";
import { TagInput } from "@/routes/-features/tags";
import type { memoAttachmentsTable } from "@/schema";
import {
  formatAttachmentSize,
  getAttachmentPreviewKind,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS_PER_MEMO,
} from "@/utils/attachment-constants";
import type { AttachmentQuota } from "@/utils/attachments";
import { readMediaDimensions } from "@/utils/media-dimensions";

type MemoAttachment = typeof memoAttachmentsTable.$inferSelect;
type EditableMemo = {
  id: string;
  title: string;
  content: string;
  url: string | null;
  categoryId: string | null;
  isAiSummary: number;
  tags: ReadonlyArray<Tag>;
  attachments: ReadonlyArray<MemoAttachment>;
};

type StagedAttachment = {
  token: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  mediaWidth: number | null;
  mediaHeight: number | null;
  etag: string;
};

type PendingFile = {
  id: string;
  file: File;
  dimensions: Awaited<ReturnType<typeof readMediaDimensions>>;
};

const toTagNames = (tags: ReadonlyArray<Tag>) => tags.map((tag) => tag.name);

export default function EditMemoForm({
  memo,
  categories,
  availableTags,
  returnTo,
}: {
  memo: EditableMemo;
  categories: ReadonlyArray<z.infer<typeof categorySchema.read>>;
  availableTags: ReadonlyArray<Tag>;
  returnTo: string;
}) {
  const [title, setTitle] = useState(memo.title);
  const [content, setContent] = useState(memo.content);
  const [url, setUrl] = useState(memo.url ?? "");
  const [categoryId, setCategoryId] = useState(memo.categoryId ?? "");
  const [tags, setTags] = useState<Tag[]>([...memo.tags]);
  const attachments = memo.attachments;
  const [deletedAttachmentIds, setDeletedAttachmentIds] = useState<string[]>(
    [],
  );
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [quota, setQuota] = useState<AttachmentQuota>();
  const [error, setError] = useState<string>();
  const [isCheckingFiles, setIsCheckingFiles] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const isLeavingAfterSave = useRef(false);

  const deletedBytes = attachments
    .filter((attachment) => deletedAttachmentIds.includes(attachment.id))
    .reduce((total, attachment) => total + attachment.sizeBytes, 0);
  const activeAttachments = attachments.filter(
    (attachment) => !deletedAttachmentIds.includes(attachment.id),
  );
  const isDirty =
    title !== memo.title ||
    content !== memo.content ||
    url !== (memo.url ?? "") ||
    categoryId !== (memo.categoryId ?? "") ||
    JSON.stringify(toTagNames(tags)) !==
      JSON.stringify(toTagNames(memo.tags)) ||
    deletedAttachmentIds.length > 0 ||
    files.length > 0;

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!isDirty || isLeavingAfterSave.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty]);

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
    input.value = "";
    if (selected.length === 0) return;

    setError(undefined);
    setIsCheckingFiles(true);
    try {
      const nextQuota = quota ?? (await readQuota());
      const maxFiles = Math.min(
        nextQuota.maxFilesPerMemo,
        MAX_ATTACHMENTS_PER_MEMO,
      );
      if (
        activeAttachments.length + files.length + selected.length >
        maxFiles
      ) {
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
      const selectedBytes =
        files.reduce((total, pending) => total + pending.file.size, 0) +
        selected.reduce((total, file) => total + file.size, 0);
      if (
        nextQuota.remaining !== null &&
        selectedBytes > nextQuota.remaining + deletedBytes
      ) {
        setError("選択したファイルの合計が残りの添付容量を超えています。");
        return;
      }
      const pending: PendingFile[] = [];
      for (const file of selected) {
        try {
          pending.push({
            id: crypto.randomUUID(),
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
      setFiles((current) => [...current, ...pending]);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "添付容量を確認できませんでした。",
      );
    } finally {
      setIsCheckingFiles(false);
    }
  };

  const removeFile = (id: string) => {
    setFiles((current) => current.filter((pending) => pending.id !== id));
  };

  const toggleAttachment = (attachmentId: string) => {
    setDeletedAttachmentIds((current) =>
      current.includes(attachmentId)
        ? current.filter((id) => id !== attachmentId)
        : [...current, attachmentId],
    );
    setError(undefined);
  };

  const cleanupStaged = async (tokens: ReadonlyArray<string>) => {
    if (tokens.length === 0) return;
    await fetch(`/api/memos/${memo.id}/edit-attachments/cleanup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tokens }),
    }).catch(() => undefined);
  };

  const stageFiles = async (editId: string) => {
    const staged: StagedAttachment[] = [];
    for (const pending of files) {
      const file = pending.file;
      const response = await fetch(`/api/memos/${memo.id}/edit-attachments`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": file.type || "application/octet-stream",
          "X-Edit-Id": editId,
          "X-File-Name": encodeURIComponent(file.name),
          "X-File-Size": String(file.size),
          ...(pending.dimensions
            ? {
                "X-Media-Width": String(pending.dimensions.width),
                "X-Media-Height": String(pending.dimensions.height),
              }
            : {}),
        },
        body: file,
      });
      const payload = (await response.json().catch(() => ({}))) as {
        attachment?: StagedAttachment;
        message?: string;
      };
      if (!response.ok || !payload.attachment) {
        await cleanupStaged(staged.map((attachment) => attachment.token));
        throw new Error(
          payload.message ?? "添付ファイルを準備できませんでした。",
        );
      }
      staged.push(payload.attachment);
    }
    return staged;
  };

  const submit = async (event: Event) => {
    event.preventDefault();
    if (isSaving || isCheckingFiles) return;
    setError(undefined);
    setIsSaving(true);

    try {
      const staged = await stageFiles(crypto.randomUUID());
      const response = await fetch(`/api/memos/${memo.id}`, {
        method: "PATCH",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title,
          content,
          url: url || null,
          categoryId: categoryId || null,
          tags: toTagNames(tags),
          deleteAttachmentIds: deletedAttachmentIds,
          stagedAttachments: staged,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        message?: string;
      };
      if (!response.ok) {
        setError(payload.message ?? "メモを更新できませんでした。");
        return;
      }
      isLeavingAfterSave.current = true;
      window.location.assign(returnTo);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "通信に失敗しました。もう一度お試しください。",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const cancel = (event: MouseEvent) => {
    if (isDirty && !window.confirm("未保存の変更を破棄しますか？")) {
      event.preventDefault();
    }
  };

  return (
    <form className="flex flex-col gap-4" onSubmit={submit}>
      {memo.isAiSummary === 1 && (
        <div className="badge badge-soft badge-info">✨ AI Summary</div>
      )}
      {error && (
        <div aria-live="polite" className="alert alert-error" role="alert">
          {error}
        </div>
      )}
      <label className="flex flex-col gap-1" htmlFor="edit-memo-title">
        Title
        <input
          className="input w-full!"
          id="edit-memo-title"
          maxLength={255}
          onInput={(event) =>
            setTitle((event.currentTarget as HTMLInputElement).value)
          }
          required
          type="text"
          value={title}
        />
      </label>
      <label className="flex flex-col gap-1" htmlFor="edit-memo-content">
        Content
        <textarea
          className="textarea min-h-40 w-full!"
          id="edit-memo-content"
          maxLength={10000}
          onInput={(event) =>
            setContent((event.currentTarget as HTMLTextAreaElement).value)
          }
          required
          value={content}
        >
          {content}
        </textarea>
      </label>
      <label className="flex flex-col gap-1" htmlFor="edit-memo-url">
        URL (optional)
        <input
          className="input w-full!"
          id="edit-memo-url"
          maxLength={2048}
          onInput={(event) =>
            setUrl((event.currentTarget as HTMLInputElement).value)
          }
          type="url"
          value={url}
        />
      </label>
      <label className="flex flex-col gap-1" htmlFor="edit-memo-category">
        Category
        <select
          className="select w-full!"
          id="edit-memo-category"
          onChange={(event) =>
            setCategoryId((event.currentTarget as HTMLSelectElement).value)
          }
          value={categoryId}
        >
          <option value="">Select Category</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </label>
      <div className="flex flex-col gap-1">
        <label htmlFor="edit-memo-tags">Tags</label>
        <TagInput
          availableTags={availableTags}
          initialTags={tags}
          inputId="edit-memo-tags"
          onTagsChange={setTags}
        />
      </div>
      <section className="space-y-3">
        <h2 className="font-semibold">添付ファイル</h2>
        {attachments.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-base-content/70 text-sm">アップロード済み</h3>
            <ul className="space-y-2">
              {attachments.map((attachment) => {
                const markedForDeletion = deletedAttachmentIds.includes(
                  attachment.id,
                );
                return (
                  <li
                    className={`rounded-box bg-base-200 p-3 ${
                      markedForDeletion ? "opacity-60" : ""
                    }`}
                    key={attachment.id}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <a
                        className="link min-w-0 break-all"
                        download
                        href={`/api/attachments/${attachment.id}`}
                      >
                        {attachment.fileName}
                      </a>
                      <button
                        className="btn btn-ghost btn-xs"
                        disabled={isSaving}
                        onClick={() => toggleAttachment(attachment.id)}
                        type="button"
                      >
                        {markedForDeletion ? "削除を取り消す" : "削除"}
                      </button>
                    </div>
                    <p className="text-base-content/70 text-sm">
                      {attachment.contentType}・
                      {formatAttachmentSize(attachment.sizeBytes)}
                      {markedForDeletion && "（更新時に削除）"}
                    </p>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        {files.length > 0 && (
          <div className="space-y-2 rounded-box border border-base-300 bg-base-100 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold">追加予定</h3>
              <span className="badge badge-soft badge-info">
                更新時にアップロード
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
                    disabled={isSaving}
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
        <label className="flex flex-col gap-1" htmlFor="edit-memo-attachments">
          追加するファイル
          <input
            accept="*/*"
            className="file-input w-full"
            disabled={isSaving || isCheckingFiles}
            id="edit-memo-attachments"
            multiple
            onChange={selectFiles}
            type="file"
          />
        </label>
        {quota && (
          <p className="text-base-content/70 text-sm">
            使用量: {formatAttachmentSize(quota.used)} /{" "}
            {quota.limit === null
              ? "無制限"
              : formatAttachmentSize(quota.limit)}
          </p>
        )}
      </section>
      <div className="flex gap-2">
        <a className="btn flex-1" href={returnTo} onClick={cancel}>
          キャンセル
        </a>
        <button
          className="btn btn-primary flex-1"
          disabled={isSaving || isCheckingFiles}
          type="submit"
        >
          {isSaving ? <span className="loading loading-spinner" /> : "更新"}
        </button>
      </div>
    </form>
  );
}
