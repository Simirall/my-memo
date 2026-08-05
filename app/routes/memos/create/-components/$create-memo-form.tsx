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

  const submit = async (event: Event) => {
    event.preventDefault();
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
      <label className="flex flex-col gap-1" htmlFor="memo-title">
        Title
        <input
          className="input"
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
          className="textarea min-h-40"
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
          className="input"
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
          <select className="select" id="memo-category" name="categoryId">
            <option value="">Select Category</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="flex flex-col gap-1" htmlFor="memo-tags">
        Tags
        <TagInput availableTags={tags} inputId="memo-tags" />
      </label>
      <button className="btn" disabled={isLoading} type="submit">
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
