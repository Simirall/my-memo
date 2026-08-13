import dotsSixVerticalIcon from "@phosphor-icons/core/assets/regular/dots-six-vertical.svg?raw";
import { useEffect, useRef, useState } from "hono/jsx";
import type { z } from "zod";
import { PhosphorIcon } from "@/components/phosphor-icon";
import type { categorySchema } from "@/features/categories/schema/category-schema";
import { DeleteButton } from "./$delete-button";

type Category = Pick<z.infer<typeof categorySchema.read>, "id" | "name">;
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
  const dragStartRef = useRef<Category[]>([]);
  const dragCurrentRef = useRef<Category[]>([]);
  const draggedIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (status !== "saved") return;
    const timeout = window.setTimeout(() => setStatus("idle"), 2000);
    return () => window.clearTimeout(timeout);
  }, [status]);

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
            </a>
            <DeleteButton
              action={`/api/categories/delete/${category.id}`}
              confirmMessage={`「${category.name}」を削除しますか？`}
              label={`カテゴリー「${category.name}」を削除`}
            />
          </li>
        ))}
      </ul>
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
      </div>
    </div>
  );
};
