import { useEffect, useState } from "hono/jsx";
import type z from "zod";
import type { categorySchema } from "@/features/categories/schema/category-schema";
import {
  clearPendingShare,
  readPendingShare,
} from "@/features/sharing/client/share-client";
import { getShareDestination } from "@/features/sharing/model/share";
import type { Tag } from "@/features/tags/data/tags";
import { TagInput } from "@/features/tags/input/tag-input";

export default function UrlSummaryForm({
  categories,
  tags = [],
  initialUrl,
}: {
  categories: ReadonlyArray<z.infer<typeof categorySchema.read>>;
  tags?: ReadonlyArray<Tag>;
  initialUrl?: string;
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [progress, setProgress] = useState<string>();
  const [summary, setSummary] = useState("");
  const [url, setUrl] = useState(initialUrl ?? "");

  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has("shared")) return;

    const pendingShare = readPendingShare();
    if (!pendingShare) return;

    const destination = getShareDestination(pendingShare);
    if (destination.kind !== "url") return;

    setUrl(destination.url);
    clearPendingShare();
  }, []);

  const submit = async (event: Event) => {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    setError(undefined);
    setProgress("ページを取得しています…");
    setSummary("");
    setIsLoading(true);

    try {
      const response = await fetch(form.action, {
        method: "POST",
        body: new FormData(form),
        headers: { Accept: "text/event-stream" },
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as {
          message?: string;
        };
        setError(payload.message ?? "AI要約を作成できませんでした。");
        return;
      }

      await readSummaryStream(response, (event, payload) => {
        if (event === "status" && payload.message) {
          setProgress(payload.message);
        } else if (event === "chunk" && payload.text) {
          setProgress("要約を生成しています…");
          setSummary((current) => current + payload.text);
        } else if (event === "complete") {
          window.location.assign(payload.redirect ?? "/");
        } else if (event === "error") {
          throw new Error(payload.message ?? "AI要約を作成できませんでした。");
        }
      });
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "AI要約を作成できませんでした。もう一度お試しください。",
      );
    } finally {
      setIsLoading(false);
      setProgress(undefined);
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
      {progress && (
        <p
          aria-live="polite"
          className="text-base-content/70 text-sm"
          role="status"
        >
          {progress}
        </p>
      )}
      {summary && (
        <div className="rounded-box border border-base-300 bg-base-200 p-4">
          <p className="mb-2 font-semibold text-sm">生成中の要約</p>
          <pre className="whitespace-pre-wrap font-sans text-base-content">
            {summary}
          </pre>
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

type SummaryStreamEvent = "chunk" | "complete" | "error" | "status";

type SummaryStreamPayload = {
  message?: string;
  redirect?: string;
  text?: string;
};

const readSummaryStream = async (
  response: Response,
  onEvent: (event: SummaryStreamEvent, payload: SummaryStreamPayload) => void,
) => {
  if (!response.body) throw new Error("ストリームを読み込めませんでした。");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let completed = false;

  const consumeEvent = (rawEvent: string) => {
    let event: SummaryStreamEvent = "status";
    const dataLines: string[] = [];
    for (const line of rawEvent.split(/\r?\n/)) {
      if (line.startsWith("event:")) {
        event = line.slice("event:".length).trim() as SummaryStreamEvent;
      } else if (line.startsWith("data:")) {
        dataLines.push(line.slice("data:".length).trimStart());
      }
    }
    const data = dataLines.join("\n");

    if (!data) return;

    const payload = JSON.parse(data) as SummaryStreamPayload;
    if (event === "complete") completed = true;
    onEvent(event, payload);
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split(/\r?\n\r?\n/);
      buffer = events.pop() ?? "";
      for (const event of events) consumeEvent(event);
    }

    buffer += decoder.decode();
    if (buffer.trim()) consumeEvent(buffer);
  } finally {
    reader.releaseLock();
  }

  if (!completed) throw new Error("要約処理が完了しませんでした。");
};
