import { useEffect, useState } from "hono/jsx";
import type z from "zod";
import type { categorySchema } from "@/routes/-features/categories";
import {
  clearPendingShare,
  getShareDestination,
  readPendingShare,
} from "@/routes/-features/sharing";
import type { Tag } from "@/routes/-features/tags";
import { TagInput } from "@/routes/-features/tags";

export default function UrlSummaryForm({
  categories,
  tags = [],
  error: initialError,
  initialUrl,
}: {
  categories: ReadonlyArray<z.infer<typeof categorySchema.read>>;
  tags?: ReadonlyArray<Tag>;
  error?: string;
  initialUrl?: string;
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(initialError);
  const [url, setUrl] = useState(initialUrl ?? "");

  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has("shared")) return;

    const pendingShare = readPendingShare();
    if (!pendingShare) return;

    const destination = getShareDestination(pendingShare);
    if (destination.kind !== "url-summary") return;

    setUrl(destination.url);
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
      setError(payload.message ?? "AI要約を作成できませんでした。");
    } catch {
      setError("通信に失敗しました。もう一度お試しください。");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form
      action="/api/memos/url"
      className="flex flex-col gap-4"
      method="post"
      onSubmit={submit}
    >
      {error && (
        <div aria-live="polite" className="alert alert-error" role="alert">
          {error}
        </div>
      )}
      <label className="flex flex-col gap-1" htmlFor="summary-url">
        URL
        <input
          className="input"
          id="summary-url"
          name="url"
          onInput={(event) =>
            setUrl((event.currentTarget as HTMLInputElement).value)
          }
          required
          type="url"
          value={url}
        />
      </label>
      {categories.length > 0 && (
        <label className="flex flex-col gap-1" htmlFor="summary-category">
          Category
          <select className="select" id="summary-category" name="category">
            <option value="">Select Category</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="flex flex-col gap-1" htmlFor="summary-tags">
        Tags
        <TagInput availableTags={tags} inputId="summary-tags" />
      </label>
      <button className="btn" disabled={isLoading} type="submit">
        {isLoading ? (
          <span className="loading loading-spinner" />
        ) : (
          "Summarize Page"
        )}
      </button>
    </form>
  );
}
