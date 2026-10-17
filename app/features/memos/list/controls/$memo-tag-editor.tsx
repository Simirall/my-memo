"use client";

import { useEffect, useRef, useState } from "react";
import { afterDialogCloseAnimation } from "@/components/dialog-close";
import { useAppRouter } from "@/components/navigation";
import type { MemoListQuery } from "@/features/memos/list/query/memo-list-query";
import type { Tag, TagSuggestions } from "@/features/tags/data/tags";
import { TagInput } from "@/features/tags/input/tag-input";

type MemoTagTarget = {
  categoryId?: string;
  id: string;
  title: string;
  tags: Tag[];
};

const sortTags = (tags: ReadonlyArray<Tag>) =>
  [...tags].sort((a, b) => a.name.localeCompare(b.name, "ja"));

const mergeTags = (...groups: ReadonlyArray<ReadonlyArray<Tag>>): Tag[] => {
  const tagsByName = new Map<string, Tag>();
  for (const group of groups) {
    for (const tag of group) tagsByName.set(tag.name, tag);
  }
  return sortTags([...tagsByName.values()]);
};

export default function MemoTagEditor({
  availableTags,
  tagSuggestions,
  suggestedTags = [],
}: {
  activeTagId?: string;
  availableTags: ReadonlyArray<Tag>;
  tagSuggestions?: TagSuggestions;
  suggestedTags?: ReadonlyArray<Tag>;
  listPath?: string;
  query?: MemoListQuery;
}) {
  const router = useAppRouter();
  const [target, setTarget] = useState<MemoTagTarget | null>(null);
  const [draft, setDraft] = useState<Tag[]>([]);
  const [knownTags, setKnownTags] = useState<Tag[]>(sortTags(availableTags));
  const [knownSuggestions, setKnownSuggestions] = useState<Tag[]>(
    sortTags(suggestedTags),
  );
  const [knownTagSuggestions, setKnownTagSuggestions] =
    useState(tagSuggestions);
  const [error, setError] = useState<string>();
  const [isSaving, setIsSaving] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const savedTags = useRef(new Map<string, Tag[]>());
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!target || !dialog?.isConnected || dialog.open) return;
    dialog.showModal();
  }, [target]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!dialogRef.current?.isConnected) return;
      const button = (event.target as Element).closest<HTMLButtonElement>(
        "[data-memo-tag-edit]",
      );
      if (!button) return;

      let tags: Tag[];
      try {
        const parsed: unknown = JSON.parse(button.dataset.memoTags ?? "[]");
        if (!Array.isArray(parsed)) return;
        tags =
          savedTags.current.get(button.dataset.memoId ?? "") ??
          (parsed as Tag[]);
      } catch {
        return;
      }

      const nextTarget = {
        categoryId: button.dataset.memoCategoryId || undefined,
        id: button.dataset.memoId ?? "",
        title: button.dataset.memoTitle ?? "",
        tags,
      };
      if (!nextTarget.id) return;
      setTarget(nextTarget);
      setDraft(tags);
      setError(undefined);
      setResetKey((value) => value + 1);
      setKnownTags((currentTags) => mergeTags(currentTags, tags));
      if (knownTagSuggestions) {
        setKnownSuggestions(
          sortTags(
            nextTarget.categoryId
              ? (knownTagSuggestions.byCategory[nextTarget.categoryId] ?? [])
              : knownTagSuggestions.all,
          ),
        );
      }
      triggerRef.current = button;
    };

    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [knownTagSuggestions]);

  const save = async () => {
    if (!target) return;
    setError(undefined);
    setIsSaving(true);
    try {
      const response = await fetch(`/api/memos/${target.id}/tags`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ tags: draft.map((tag) => tag.name) }),
      });
      const payload = (await response.json()) as {
        message?: string;
        tags?: Tag[];
        tagSuggestions?: TagSuggestions;
      };
      if (!response.ok || !payload.tags) {
        setError(payload.message ?? "タグを保存できませんでした。");
        return;
      }

      setKnownTags((currentTags) =>
        mergeTags(currentTags, draft, payload.tags ?? []),
      );
      if (payload.tagSuggestions) {
        setKnownTagSuggestions(payload.tagSuggestions);
        setKnownSuggestions(
          sortTags(
            target.categoryId
              ? (payload.tagSuggestions.byCategory[target.categoryId] ?? [])
              : payload.tagSuggestions.all,
          ),
        );
      } else {
        setKnownSuggestions((currentTags) =>
          mergeTags(currentTags, payload.tags ?? []),
        );
      }
      savedTags.current.set(target.id, payload.tags);
      try {
        await router.reload();
        dialogRef.current?.close();
      } catch {
        setError(
          "保存済みですが表示を更新できませんでした。ページを再読み込みしてください。",
        );
      }
    } catch {
      setError("通信に失敗しました。もう一度お試しください。");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <dialog
      aria-labelledby="memo-tags-title"
      className="modal"
      onClose={(event) => {
        afterDialogCloseAnimation(
          event.currentTarget as HTMLDialogElement,
          () => {
            setTarget(null);
            triggerRef.current?.focus();
          },
        );
      }}
      ref={dialogRef}
    >
      <div className="modal-box overflow-visible">
        <h2 className="font-bold text-lg" id="memo-tags-title">
          タグを編集
        </h2>
        <p className="py-2 text-sm">
          「{target?.title ?? ""}」のタグを設定します。
        </p>
        <label className="flex flex-col gap-1" htmlFor="edit-memo-tags">
          Tags
          <TagInput
            availableTags={knownTags}
            initialTags={draft}
            inputId="edit-memo-tags"
            key={resetKey}
            onTagsChange={setDraft}
            suggestedTags={knownSuggestions}
          />
        </label>
        {error && (
          <div
            aria-live="polite"
            className="alert alert-error mt-3"
            role="alert"
          >
            {error}
          </div>
        )}
        <div className="modal-action">
          <button
            className="btn"
            onClick={() => dialogRef.current?.close()}
            type="button"
          >
            キャンセル
          </button>
          <button
            className="btn btn-primary"
            disabled={isSaving}
            onClick={save}
            type="button"
          >
            {isSaving ? <span className="loading loading-spinner" /> : "保存"}
          </button>
        </div>
      </div>
      <form className="modal-backdrop" method="dialog">
        <button aria-label="閉じる" type="submit">
          閉じる
        </button>
      </form>
    </dialog>
  );
}
