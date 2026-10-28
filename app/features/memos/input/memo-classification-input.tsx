"use client";

import { useState } from "react";
import { ClassificationSuggestionButton } from "@/features/memos/input/classification-suggestion-button";
import { TagInput } from "@/features/tags/input/tag-input";
import type { Tag, TagSuggestions } from "@/features/tags/model/tags";

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
  const [mode, setMode] = useState<"manual" | "ai">(summary ? "ai" : "manual");
  const [isOpen, setIsOpen] = useState(false);
  const prefix = summary ? "summary" : "memo";
  const openManual = () => {
    setMode("manual");
    setIsOpen(true);
  };
  const selectAi = () => {
    setMode("ai");
    setIsOpen(false);
  };

  return (
    <section aria-label="分類設定" className="space-y-3">
      <h2 className="font-semibold">カテゴリー・タグ</h2>
      <input name="classificationMode" type="hidden" value={mode} />
      {summary && (
        <div className="grid grid-cols-2 gap-2">
          <button
            className={`btn h-auto min-h-12 px-2 whitespace-normal ${mode === "ai" ? "btn-soft btn-primary" : ""}`}
            disabled={disabled}
            onClick={selectAi}
            type="button"
          >
            AIで自動設定する
          </button>
          <button
            aria-controls={`${prefix}-manual-classification`}
            aria-expanded={isOpen ? "true" : "false"}
            className={`btn h-auto min-h-12 px-2 whitespace-normal ${mode === "manual" ? "btn-soft btn-primary" : ""}`}
            disabled={disabled}
            onClick={openManual}
            type="button"
          >
            手動で設定する
          </button>
        </div>
      )}
      {summary && mode === "ai" && (
        <p className="text-base-content/70 text-sm" role="status">
          要約後にAIで分類します。
        </p>
      )}
      <div hidden={summary && !isOpen} id={`${prefix}-manual-classification`}>
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
      {!summary && (
        <ClassificationSuggestionButton
          categoryId={categoryId}
          content={content}
          disabled={disabled}
          onCategory={onCategory}
          onTags={onTags}
          tags={tags}
          title={title}
        />
      )}
    </section>
  );
}
