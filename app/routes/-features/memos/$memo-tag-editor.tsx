import { useEffect, useRef, useState } from "hono/jsx";
import type { Tag } from "@/routes/-features/tags";
import { TagInput } from "@/routes/-features/tags";
import { addMemoListTagOptions, removeMemoCardFromList } from "./memo-list-dom";
import { type MemoListQuery, replaceMemoListTag } from "./memo-list-query";

type MemoTagTarget = {
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

const updateCardTags = (
  memoId: string,
  tags: ReadonlyArray<Tag>,
  listPath: string,
  query: MemoListQuery,
) => {
  const card = document.querySelector<HTMLElement>(
    `[data-memo-card="${CSS.escape(memoId)}"]`,
  );
  const list = card?.querySelector<HTMLElement>("[data-memo-tag-list]");
  if (!card || !list) return;
  const editButton = card.querySelector<HTMLButtonElement>(
    "[data-memo-tag-edit]",
  );
  if (editButton) editButton.dataset.memoTags = JSON.stringify(tags);

  const tagList = list.querySelector("ul");
  if (!tagList) return;
  tagList.replaceChildren(
    ...sortTags(tags).map((tag) => {
      const item = document.createElement("li");
      const link = document.createElement("a");
      item.appendChild(link);
      link.className = "badge badge-soft badge-info hover:underline";
      link.href = replaceMemoListTag(listPath, query, tag.id);
      link.textContent = `#${tag.name}`;
      return item;
    }),
  );
};

export default function MemoTagEditor({
  activeTagId,
  availableTags,
  listPath = "/",
  query = { sort: "desc" },
}: {
  activeTagId?: string;
  availableTags: ReadonlyArray<Tag>;
  listPath?: string;
  query?: MemoListQuery;
}) {
  const [target, setTarget] = useState<MemoTagTarget | null>(null);
  const [draft, setDraft] = useState<Tag[]>([]);
  const [knownTags, setKnownTags] = useState<Tag[]>(sortTags(availableTags));
  const [error, setError] = useState<string>();
  const [isSaving, setIsSaving] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const dialogRef = useRef<HTMLDialogElement>(null);
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
        tags = parsed as Tag[];
      } catch {
        return;
      }

      const nextTarget = {
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
      triggerRef.current = button;
    };

    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

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
      };
      if (!response.ok || !payload.tags) {
        setError(payload.message ?? "タグを保存できませんでした。");
        return;
      }

      updateCardTags(target.id, payload.tags, listPath, query);
      addMemoListTagOptions(payload.tags);
      setKnownTags((currentTags) =>
        mergeTags(currentTags, draft, payload.tags ?? []),
      );
      dialogRef.current?.close();

      if (activeTagId && !payload.tags.some((tag) => tag.id === activeTagId)) {
        removeMemoCardFromList(target.id);
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
      onClose={() => {
        setTarget(null);
        triggerRef.current?.focus();
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
            onTagsChange={setDraft}
            resetKey={resetKey}
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
