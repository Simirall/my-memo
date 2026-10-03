import { useEffect, useRef, useState } from "hono/jsx";
import type { Tag } from "@/features/tags/data/tags";

type Payload = {
  categoryId: string | null;
  tags: Tag[];
  candidatesLimited: boolean;
  usage: { used: number; limit: number | null };
  message?: string;
};

type SuggestionProps = {
  title: string;
  content: string;
  categoryId: string;
  tags: ReadonlyArray<Tag>;
  disabled?: boolean;
  onCategory: (categoryId: string) => void;
  onTags: (tags: Tag[]) => void;
};

export function useClassificationSuggestion({
  title,
  content,
  categoryId,
  tags,
  disabled = false,
  onCategory,
  onTags,
}: SuggestionProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  const revision = useRef(0);
  const busy = useRef(false);
  const mounted = useRef(true);
  const rootRef = useRef<HTMLElement>(null);
  const isDisabled = useRef(disabled);
  isDisabled.current = disabled;
  const currentInput = useRef("");
  const nextInput = JSON.stringify({
    title,
    content,
    categoryId,
    tags: tags.map((tag) => tag.name),
    disabled,
  });
  if (currentInput.current !== nextInput) {
    currentInput.current = nextInput;
    revision.current++;
  }
  useEffect(() => {
    mounted.current = true;
    const invalidate = () => revision.current++;
    const form = rootRef.current?.closest("form");
    form?.addEventListener("input", invalidate);
    form?.addEventListener("submit", invalidate, true);
    window.addEventListener("pagehide", invalidate);
    return () => {
      mounted.current = false;
      revision.current++;
      form?.removeEventListener("input", invalidate);
      form?.removeEventListener("submit", invalidate, true);
      window.removeEventListener("pagehide", invalidate);
    };
  }, []);

  const suggest = async () => {
    if (busy.current || disabled || (!title.trim() && !content.trim())) return;
    busy.current = true;
    const snapshot = revision.current;
    setIsLoading(true);
    setMessage(undefined);
    setError(undefined);
    try {
      const response = await fetch("/api/memos/suggest-classification", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title,
          content,
          currentCategoryId: categoryId || null,
          currentTags: tags.map((tag) => tag.name),
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as Payload;
      if (!mounted.current || isDisabled.current) return;
      if (revision.current !== snapshot) {
        setMessage(
          "入力が変更されたため、古いサジェスト結果は反映しませんでした。",
        );
        return;
      }
      if (!response.ok) {
        setError(payload.message ?? "AIサジェストを取得できませんでした。");
        return;
      }
      if (!categoryId && payload.categoryId) onCategory(payload.categoryId);
      const existing = new Set(tags.map((tag) => tag.name));
      const added = payload.tags.filter((tag) => !existing.has(tag.name));
      if (added.length > 0) onTags([...tags, ...added]);
      const remaining =
        payload.usage.limit === null
          ? "無制限"
          : String(Math.max(0, payload.usage.limit - payload.usage.used));
      setMessage(
        `${payload.categoryId || added.length > 0 ? "サジェストを反映しました。" : "追加する候補はありませんでした。"} 残り${remaining}回。${payload.candidatesLimited ? " 使用頻度の高い候補に絞って判断しました。" : ""}`,
      );
    } catch {
      if (
        mounted.current &&
        !isDisabled.current &&
        revision.current === snapshot
      )
        setError("通信に失敗しました。もう一度お試しください。");
    } finally {
      busy.current = false;
      if (mounted.current) setIsLoading(false);
    }
  };

  return {
    suggest,
    isLoading,
    message,
    error,
    rootRef,
    invalidate: () => revision.current++,
  };
}

export function ClassificationSuggestionButton(props: SuggestionProps) {
  const { suggest, isLoading, message, error, rootRef } =
    useClassificationSuggestion(props);
  const { disabled, title, content } = props;

  return (
    <div className="flex flex-col gap-2" ref={rootRef}>
      <button
        className="btn btn-sm self-start"
        disabled={disabled || isLoading || (!title.trim() && !content.trim())}
        onClick={() => void suggest()}
        type="button"
      >
        {isLoading && <span className="loading loading-spinner loading-sm" />}
        {isLoading ? "判断しています…" : "AIでカテゴリー・タグを提案"}
      </button>
      {message && (
        <p
          aria-live="polite"
          className="text-base-content/70 text-sm"
          role="status"
        >
          {message}
        </p>
      )}
      {error && (
        <p aria-live="polite" className="text-error text-sm" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
