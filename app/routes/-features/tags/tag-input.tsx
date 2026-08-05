import { useEffect, useState } from "hono/jsx";
import type { Tag } from "./tags";
import {
  MAX_TAG_NAME_LENGTH,
  MAX_TAGS_PER_MEMO,
  normalizeTagNames,
} from "./tags";

export const TagInput = ({
  availableTags,
  initialTags = [],
  inputId,
  name = "tags",
  onTagsChange,
  resetKey,
}: {
  availableTags: ReadonlyArray<Tag>;
  initialTags?: ReadonlyArray<Tag>;
  inputId: string;
  name?: string;
  onTagsChange?: (tags: Tag[]) => void;
  resetKey?: number | string;
}) => {
  const [selected, setSelected] = useState<Tag[]>([...initialTags]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (resetKey === undefined) return;
    setSelected([...initialTags]);
    setQuery("");
    setError(undefined);
  }, [resetKey]);

  const addTag = (rawName: string) => {
    const normalized = normalizeTagNames([
      ...selected.map((tag) => tag.name),
      rawName,
    ]);
    if (!normalized.ok) {
      setError(normalized.message);
      return;
    }
    const name = normalized.names.at(-1);
    if (!name || selected.some((tag) => tag.name === name)) {
      setQuery("");
      return;
    }
    const existing = availableTags.find((tag) => tag.name === name);
    const nextSelected = [...selected, existing ?? { id: `new-${name}`, name }];
    setSelected(nextSelected);
    onTagsChange?.(nextSelected);
    setQuery("");
    setError(undefined);
  };

  const removeTag = (name: string) => {
    const nextSelected = selected.filter((tag) => tag.name !== name);
    setSelected(nextSelected);
    onTagsChange?.(nextSelected);
    setError(undefined);
  };

  const candidates = availableTags.filter(
    (tag) =>
      !selected.some((selectedTag) => selectedTag.name === tag.name) &&
      tag.name.toLocaleLowerCase("ja").includes(query.toLocaleLowerCase("ja")),
  );
  const freeformName = query.trim();
  const isAlreadySelected = selected.some((tag) => tag.name === freeformName);
  const isExistingTag = availableTags.some((tag) => tag.name === freeformName);
  const canCreateFreeform =
    freeformName.length > 0 &&
    !isAlreadySelected &&
    !isExistingTag &&
    normalizeTagNames([...selected.map((tag) => tag.name), freeformName]).ok;
  const hasSuggestions = canCreateFreeform || candidates.length > 0;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex min-h-10 flex-wrap items-center gap-2 rounded-field border border-base-300 bg-base-100 p-2">
        {selected.map((tag) => (
          <span
            className={`badge gap-1 pr-0 ${
              tag.name === freeformName
                ? "badge-soft badge-primary"
                : "badge-soft badge-info"
            }`}
            data-tag-chip={tag.name}
            key={tag.name}
          >
            #{tag.name}
            <button
              aria-label={`${tag.name}を外す`}
              className="btn btn-circle btn-ghost btn-xs p-0 text-xs leading-none"
              onClick={() => removeTag(tag.name)}
              type="button"
            >
              <span aria-hidden="true">×</span>
            </button>
          </span>
        ))}
        <input
          aria-autocomplete="list"
          aria-controls={`${inputId}-suggestions`}
          aria-describedby={error ? `${inputId}-error` : undefined}
          className="input min-w-32 flex-1 border-0 p-0 focus:outline-0"
          id={inputId}
          maxLength={MAX_TAG_NAME_LENGTH}
          onInput={(event) => {
            setQuery((event.currentTarget as HTMLInputElement).value);
            setError(undefined);
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            if (selected.length >= MAX_TAGS_PER_MEMO) {
              setError(
                `1つのメモに設定できるタグは${MAX_TAGS_PER_MEMO}個までです。`,
              );
              return;
            }
            addTag(query);
          }}
          placeholder={selected.length === 0 ? "タグを入力" : "タグを追加"}
          type="text"
          value={query}
        />
      </div>
      {error && (
        <p
          aria-live="polite"
          className="text-error text-sm"
          id={`${inputId}-error`}
        >
          {error}
        </p>
      )}
      {query && selected.length < MAX_TAGS_PER_MEMO && hasSuggestions && (
        <div
          className="menu rounded-box border border-base-300 bg-base-100 p-1 shadow-sm"
          id={`${inputId}-suggestions`}
          role="listbox"
        >
          {canCreateFreeform && (
            <button
              className="btn btn-ghost btn-sm justify-start"
              onClick={(event) => {
                event.stopPropagation();
                addTag(freeformName);
              }}
              role="option"
              type="button"
            >
              #{freeformName}を新しいタグとして追加
            </button>
          )}
          {candidates.slice(0, 8).map((tag) => (
            <button
              className="btn btn-ghost btn-sm justify-start"
              key={tag.id}
              onClick={(event) => {
                event.stopPropagation();
                addTag(tag.name);
              }}
              role="option"
              type="button"
            >
              #{tag.name}
            </button>
          ))}
        </div>
      )}
      <input
        name={name}
        type="hidden"
        value={JSON.stringify(selected.map((tag) => tag.name))}
      />
    </div>
  );
};
