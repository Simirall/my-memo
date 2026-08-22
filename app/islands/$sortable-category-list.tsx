import dotsSixVerticalIcon from "@phosphor-icons/core/assets/regular/dots-six-vertical.svg?raw";
import pencilSimpleIcon from "@phosphor-icons/core/assets/regular/pencil-simple.svg?raw";
import { useEffect, useRef, useState } from "hono/jsx";
import type { z } from "zod";
import { PhosphorIcon } from "@/components/phosphor-icon";
import type { categorySchema } from "@/features/categories/schema/category-schema";
import { DeleteButton } from "./$delete-button";

type Category = Pick<
  z.infer<typeof categorySchema.read>,
  "id" | "name" | "excludeFromAll"
>;
type Status = "idle" | "saved" | "error";

const moveCategory = (
  categories: ReadonlyArray<Category>,
  categoryId: string,
  targetIndex: number,
) => {
  const sourceIndex = categories.findIndex(({ id }) => id === categoryId);
  if (sourceIndex < 0 || sourceIndex === targetIndex) return [...categories];

  const next = [...categories];
  const [category] = next.splice(sourceIndex, 1);
  next.splice(targetIndex, 0, category);
  return next;
};

const hasSameOrder = (
  left: ReadonlyArray<Category>,
  right: ReadonlyArray<Category>,
) => left.every((category, index) => category.id === right[index]?.id);

export const SortableCategoryList = ({
  initialCategories,
}: {
  initialCategories: ReadonlyArray<Category>;
}) => {
  const [categories, setCategories] = useState([...initialCategories]);
  const [draggingId, setDraggingId] = useState<string | undefined>(undefined);
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [editing, setEditing] = useState<Category | undefined>(undefined);
  const [editingName, setEditingName] = useState("");
  const [editingExcludeFromAll, setEditingExcludeFromAll] = useState(false);
  const [editError, setEditError] = useState<string | undefined>(undefined);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameSaved, setRenameSaved] = useState(false);
  const dragStartRef = useRef<Category[]>([]);
  const dragCurrentRef = useRef<Category[]>([]);
  const draggedIdRef = useRef<string | undefined>(undefined);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  const editOpenerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (status !== "saved") return;
    const timeout = window.setTimeout(() => setStatus("idle"), 2000);
    return () => window.clearTimeout(timeout);
  }, [status]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (editing && !dialog.open) {
      dialog.showModal();
      editInputRef.current?.focus();
      editInputRef.current?.select();
    } else if (!editing && dialog.open) {
      dialog.close();
    }
  }, [editing]);

  useEffect(() => {
    if (!renameSaved) return;
    const timeout = window.setTimeout(() => setRenameSaved(false), 4000);
    return () => window.clearTimeout(timeout);
  }, [renameSaved]);

  const closeEditor = () => {
    if (isRenaming) return;
    setEditing(undefined);
    setEditError(undefined);
  };

  const save = async (next: Category[], previous: Category[]) => {
    setCategories(next);
    setIsSaving(true);
    setStatus("idle");

    try {
      const response = await fetch("/api/categories/reorder", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ categoryIds: next.map(({ id }) => id) }),
      });
      if (!response.ok)
        throw new Error("カテゴリーの並び順を保存できませんでした。");
      setStatus("saved");
    } catch {
      setCategories(previous);
      setStatus("error");
    } finally {
      setIsSaving(false);
    }
  };

  const finishDrag = (cancelled = false) => {
    const previous = dragStartRef.current;
    const next = dragCurrentRef.current;
    draggedIdRef.current = undefined;
    setDraggingId(undefined);

    if (cancelled) {
      setCategories(previous);
    } else if (!hasSameOrder(previous, next)) {
      void save(next, previous);
    }
  };

  return (
    <div className="space-y-2">
      <p className="sr-only" id="category-sort-instructions">
        ハンドルをドラッグするか、上下矢印キーでカテゴリーを移動できます。
      </p>
      <ul className="list rounded-box bg-base-200">
        {categories.map((category, index) => (
          <li
            className={`list-row items-center ${draggingId === category.id ? "bg-base-300" : ""}`}
            data-category-id={category.id}
            key={category.id}
          >
            <button
              aria-describedby="category-sort-instructions"
              aria-label={`カテゴリー「${category.name}」を並べ替え`}
              className="btn btn-ghost btn-square cursor-grab touch-none active:cursor-grabbing"
              disabled={isSaving}
              onKeyDown={(event) => {
                if (event.key !== "ArrowUp" && event.key !== "ArrowDown") {
                  return;
                }
                event.preventDefault();
                const targetIndex =
                  event.key === "ArrowUp" ? index - 1 : index + 1;
                if (targetIndex < 0 || targetIndex >= categories.length) return;
                const next = moveCategory(categories, category.id, targetIndex);
                void save(next, categories);
              }}
              onPointerCancel={() => finishDrag(true)}
              onPointerDown={(event) => {
                if (isSaving || !event.isPrimary || event.button !== 0) return;
                const handle = event.currentTarget as HTMLButtonElement;
                handle.setPointerCapture(event.pointerId);
                dragStartRef.current = [...categories];
                dragCurrentRef.current = [...categories];
                draggedIdRef.current = category.id;
                setDraggingId(category.id);
              }}
              onPointerMove={(event) => {
                const draggedId = draggedIdRef.current;
                if (!draggedId) return;
                const target = document
                  .elementFromPoint(event.clientX, event.clientY)
                  ?.closest<HTMLElement>("[data-category-id]");
                const targetId = target?.dataset.categoryId;
                if (!targetId || targetId === draggedId) return;
                const targetIndex = dragCurrentRef.current.findIndex(
                  ({ id }) => id === targetId,
                );
                if (targetIndex < 0) return;
                const next = moveCategory(
                  dragCurrentRef.current,
                  draggedId,
                  targetIndex,
                );
                dragCurrentRef.current = next;
                setCategories(next);
              }}
              onPointerUp={() => finishDrag()}
              type="button"
            >
              <PhosphorIcon svg={dotsSixVerticalIcon} />
            </button>
            <a
              className="list-col-grow font-semibold hover:underline"
              href={`/categories/${category.id}`}
            >
              {category.name}
              {category.excludeFromAll && (
                <span className="badge ml-2">private</span>
              )}
            </a>
            <button
              aria-label={`カテゴリー「${category.name}」を編集`}
              className="btn btn-soft"
              disabled={isSaving}
              onClick={(event) => {
                editOpenerRef.current =
                  event.currentTarget as HTMLButtonElement;
                setEditing(category);
                setEditingName(category.name);
                setEditingExcludeFromAll(category.excludeFromAll);
                setEditError(undefined);
              }}
              type="button"
            >
              <PhosphorIcon svg={pencilSimpleIcon} />
            </button>
            <DeleteButton
              action={`/api/categories/delete/${category.id}`}
              confirmMessage={`「${category.name}」を削除しますか？`}
              label={`カテゴリー「${category.name}」を削除`}
            />
          </li>
        ))}
      </ul>
      <dialog
        aria-label="カテゴリー名を変更"
        className="modal modal-middle"
        closedby="any"
        onCancel={(event: Event) => {
          event.preventDefault();
          closeEditor();
        }}
        onClose={() => {
          if (editing) closeEditor();
          editOpenerRef.current?.focus();
          editOpenerRef.current = null;
        }}
        ref={dialogRef}
      >
        <div className="modal-box">
          <h2 className="font-bold text-lg">カテゴリー名を変更</h2>
          <form
            className="mt-4 space-y-4"
            onSubmit={async (event) => {
              event.preventDefault();
              if (!editing || isRenaming) return;
              setIsRenaming(true);
              setEditError(undefined);
              try {
                const response = await fetch(
                  `/api/categories/rename/${editing.id}`,
                  {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({
                      name: editingName,
                      excludeFromAll: editingExcludeFromAll,
                    }),
                  },
                );
                const result = (await response.json().catch(() => ({}))) as {
                  message?: string;
                  name?: string;
                  excludeFromAll?: boolean;
                };
                if (
                  !response.ok ||
                  !result.name ||
                  typeof result.excludeFromAll !== "boolean"
                ) {
                  throw new Error(result.message ?? "保存できませんでした。");
                }
                setCategories((current) =>
                  current.map((category) =>
                    category.id === editing.id
                      ? {
                          ...category,
                          name: result.name as string,
                          excludeFromAll: result.excludeFromAll as boolean,
                        }
                      : category,
                  ),
                );
                setEditing(undefined);
                setRenameSaved(true);
              } catch (error) {
                setEditError(
                  error instanceof Error
                    ? error.message
                    : "保存できませんでした。",
                );
              } finally {
                setIsRenaming(false);
              }
            }}
          >
            {editError && (
              <div className="alert alert-error" role="alert">
                {editError}
              </div>
            )}
            <label className="flex flex-col gap-1" htmlFor="edit-category-name">
              <span>カテゴリー名</span>
              <input
                className="input w-full"
                disabled={isRenaming}
                id="edit-category-name"
                maxLength={50}
                onInput={(event) =>
                  setEditingName(
                    (event.currentTarget as HTMLInputElement).value,
                  )
                }
                ref={editInputRef}
                required
                type="text"
                value={editingName}
              />
            </label>
            <p className="text-base-content/70 text-sm">
              50文字以内で入力してください。
            </p>
            <label
              className="flex cursor-pointer items-center gap-3"
              htmlFor="edit-category-exclude-from-all"
            >
              <input
                aria-describedby="edit-category-exclude-from-all-help"
                checked={editingExcludeFromAll}
                className="checkbox"
                disabled={isRenaming}
                id="edit-category-exclude-from-all"
                onChange={(event) =>
                  setEditingExcludeFromAll(
                    (event.currentTarget as HTMLInputElement).checked,
                  )
                }
                type="checkbox"
              />
              <span>「すべて」の一覧に表示しない</span>
            </label>
            <p
              className="text-base-content/70 text-sm"
              id="edit-category-exclude-from-all-help"
            >
              カテゴリー別の一覧には表示されます。
            </p>
            <div className="modal-action">
              <button
                className="btn"
                disabled={isRenaming}
                onClick={closeEditor}
                type="button"
              >
                キャンセル
              </button>
              <button className="btn" disabled={isRenaming} type="submit">
                {isRenaming ? (
                  <span className="loading loading-spinner" />
                ) : (
                  "保存"
                )}
              </button>
            </div>
          </form>
        </div>
        <button
          aria-label="カテゴリー名の変更をキャンセル"
          className="modal-backdrop"
          disabled={isRenaming}
          onClick={closeEditor}
          type="button"
        >
          キャンセル
        </button>
      </dialog>
      <div className="toast toast-end toast-bottom pointer-events-none z-50">
        {isSaving && (
          <div
            aria-atomic="true"
            aria-live="polite"
            className="alert alert-soft alert-info pointer-events-auto w-[min(24rem,calc(100vw-2rem))] shadow-lg"
            role="status"
          >
            保存しています…
          </div>
        )}
        {status === "saved" && (
          <div
            aria-atomic="true"
            aria-live="polite"
            className="alert alert-soft alert-success pointer-events-auto w-[min(24rem,calc(100vw-2rem))] shadow-lg"
            role="status"
          >
            保存しました。
          </div>
        )}
        {status === "error" && (
          <div
            aria-atomic="true"
            aria-live="polite"
            className="alert alert-soft alert-error pointer-events-auto w-[min(24rem,calc(100vw-2rem))] shadow-lg"
            role="alert"
          >
            保存できませんでした。元の並び順に戻しました。
          </div>
        )}
        {renameSaved && (
          <div
            aria-atomic="true"
            aria-live="polite"
            className="alert alert-soft alert-success pointer-events-auto w-[min(24rem,calc(100vw-2rem))] shadow-lg"
            role="status"
          >
            カテゴリーを変更しました。
          </div>
        )}
      </div>
    </div>
  );
};
