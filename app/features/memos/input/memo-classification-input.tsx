import { useState } from "hono/jsx";
import { useClassificationSuggestion } from "@/features/memos/input/classification-suggestion-button";
import type { Tag, TagSuggestions } from "@/features/tags/data/tags";
import { TagInput } from "@/features/tags/input/tag-input";

export function MemoClassificationInput({
  categories,
  availableTags,
  tagSuggestions,
  categoryId,
  tags,
  onCategory,
  onTags,
  title = "",
  content = "",
  disabled = false,
  summary = false,
}: {
  categories: ReadonlyArray<{ id: string; name: string }>;
  availableTags: ReadonlyArray<Tag>;
  tagSuggestions: TagSuggestions;
  categoryId: string;
  tags: ReadonlyArray<Tag>;
  onCategory: (categoryId: string) => void;
  onTags: (tags: Tag[]) => void;
  title?: string;
  content?: string;
  disabled?: boolean;
  summary?: boolean;
}) {
  const [mode, setMode] = useState<"none" | "manual" | "ai">("none");
  const isOpen = mode === "manual";
  const prefix = summary ? "summary" : "memo";
  const { suggest, isLoading, message, error, rootRef, invalidate } =
    useClassificationSuggestion({
      title,
      content,
      categoryId,
      tags,
      disabled,
      onCategory,
      onTags,
    });
  const openManual = () => {
    invalidate();
    setMode("manual");
  };
  const selectAi = () => {
    setMode("ai");
    if (!summary) void suggest();
  };

  return (
    <section aria-label="分類設定" className="space-y-3" ref={rootRef}>
      <h2 className="font-semibold">カテゴリー・タグ</h2>
      <input name="classificationMode" type="hidden" value={mode} />
      <div className="grid grid-cols-2 gap-2">
        <button
          className={`btn h-auto min-h-12 whitespace-normal px-2 ${mode === "ai" ? "btn-soft btn-primary" : ""}`}
          disabled={
            disabled ||
            isLoading ||
            (!summary && !title.trim() && !content.trim())
          }
          onClick={selectAi}
          type="button"
        >
          {isLoading && <span className="loading loading-spinner loading-sm" />}
          {isLoading ? "判断しています…" : "AIで自動設定する"}
        </button>
        <button
          aria-controls={`${prefix}-manual-classification`}
          aria-expanded={isOpen ? "true" : "false"}
          className={`btn h-auto min-h-12 whitespace-normal px-2 ${mode === "manual" ? "btn-soft btn-primary" : ""}`}
          disabled={disabled}
          onClick={openManual}
          type="button"
        >
          手動で設定する
        </button>
      </div>
      {summary && mode === "ai" && (
        <p className="text-base-content/70 text-sm" role="status">
          要約後にAIで分類します。
        </p>
      )}
      {!summary && !isOpen && (
        <section aria-label="現在の分類" className="space-y-2">
          <p>
            カテゴリー：
            {categories.find((category) => category.id === categoryId)?.name ??
              "なし"}
          </p>
          <p>
            タグ：
            {tags.length
              ? tags.map((tag) => `#${tag.name}`).join("、")
              : "なし"}
          </p>
          {(categoryId || tags.length > 0 || mode === "ai") && (
            <button
              className="btn btn-sm"
              disabled={disabled}
              onClick={openManual}
              type="button"
            >
              編集
            </button>
          )}
        </section>
      )}
      <div hidden={!isOpen} id={`${prefix}-manual-classification`}>
        {categories.length > 0 ? (
          <fieldset className="fieldset">
            <label className="fieldset-legend" htmlFor={`${prefix}-category`}>
              カテゴリー
            </label>
            <select
              className="select category-select w-full!"
              id={`${prefix}-category`}
              name={summary ? "category" : "categoryId"}
              onChange={(event) =>
                onCategory((event.currentTarget as HTMLSelectElement).value)
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
        ) : (
          <input
            name={summary ? "category" : "categoryId"}
            type="hidden"
            value={categoryId}
          />
        )}
        <fieldset className="fieldset">
          <label className="fieldset-legend" htmlFor={`${prefix}-tags`}>
            タグ
          </label>
          <TagInput
            availableTags={availableTags}
            inputId={`${prefix}-tags`}
            onTagsChange={onTags}
            suggestedTags={
              categoryId
                ? (tagSuggestions.byCategory[categoryId] ?? [])
                : tagSuggestions.all
            }
            value={tags}
          />
        </fieldset>
      </div>
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
    </section>
  );
}
