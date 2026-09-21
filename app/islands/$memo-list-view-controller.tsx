import listBulletsIcon from "@phosphor-icons/core/assets/regular/list-bullets.svg?raw";
import squaresFourIcon from "@phosphor-icons/core/assets/regular/squares-four.svg?raw";
import { useEffect, useRef, useState } from "hono/jsx";
import { PhosphorIcon } from "@/components/phosphor-icon";

type View = "card" | "list";

export default function MemoListViewController({
  listPath,
}: {
  listPath: string;
}) {
  const [view, setView] = useState<View>("card");
  const [ready, setReady] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const cardRef = useRef<HTMLElement>(null);
  const markerRef = useRef<Comment>(null);
  const storageKey = `my-memo.memo-list-view:${listPath}`;

  const restoreCard = () => {
    const card = cardRef.current;
    const marker = markerRef.current;
    if (card && marker?.parentNode)
      marker.parentNode.insertBefore(card, marker);
    marker?.remove();
    cardRef.current = null;
    markerRef.current = null;
  };

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved === "list") setView("list");
    } catch {}
    setReady(true);
  }, [storageKey]);

  useEffect(() => {
    if (!ready) return;
    for (const element of document.querySelectorAll<HTMLElement>(
      "[data-memo-list-view]",
    )) {
      element.hidden = element.dataset.memoListView !== view;
    }
    document
      .querySelector<HTMLElement>("[data-memo-list-content]")
      ?.removeAttribute("hidden");
  }, [ready, view]);

  useEffect(() => {
    const openDetail = (event: MouseEvent) => {
      if (!dialogRef.current?.isConnected) return;
      const button = (event.target as Element).closest<HTMLButtonElement>(
        "[data-memo-detail]",
      );
      const memoId = button?.dataset.memoDetail;
      if (!button || !memoId || !hostRef.current || !dialogRef.current) return;
      const card = document.querySelector<HTMLElement>(
        `[data-memo-card="${CSS.escape(memoId)}"]`,
      );
      if (!card) return;
      const marker = document.createComment("memo-card-placeholder");
      card.parentNode?.insertBefore(marker, card);
      hostRef.current.appendChild(card);
      cardRef.current = card;
      markerRef.current = marker;
      triggerRef.current = button;
      dialogRef.current.showModal();
    };
    const beforeRemove = (event: Event) => {
      if (!dialogRef.current?.isConnected) return;
      const memoId = (event as CustomEvent<{ memoId: string }>).detail.memoId;
      if (cardRef.current?.dataset.memoCard !== memoId) return;
      restoreCard();
      dialogRef.current?.close();
    };
    document.addEventListener("click", openDetail);
    document.addEventListener("memo-list:remove", beforeRemove);
    return () => {
      document.removeEventListener("click", openDetail);
      document.removeEventListener("memo-list:remove", beforeRemove);
      restoreCard();
    };
  }, []);

  const changeView = (next: View) => {
    if (dialogRef.current?.open) dialogRef.current.close();
    setView(next);
    try {
      localStorage.setItem(storageKey, next);
    } catch {}
  };

  return (
    <>
      <label className="swap swap-rotate btn btn-square" hidden={!ready}>
        <input
          aria-label={
            view === "card"
              ? "リストビューに切り替え"
              : "カードビューに切り替え"
          }
          checked={view === "list"}
          onChange={(event) =>
            changeView(
              (event.currentTarget as HTMLInputElement).checked
                ? "list"
                : "card",
            )
          }
          type="checkbox"
        />
        <span className="swap-on flex size-full items-center justify-center">
          <PhosphorIcon svg={squaresFourIcon} />
        </span>
        <span className="swap-off flex size-full items-center justify-center">
          <PhosphorIcon svg={listBulletsIcon} />
        </span>
      </label>
      <dialog
        aria-label="メモ詳細"
        className="modal"
        onClose={() => {
          restoreCard();
          triggerRef.current?.focus();
        }}
        ref={dialogRef}
      >
        <div className="modal-box max-w-5xl">
          <div className="mb-2 flex justify-end">
            <button
              className="btn btn-sm"
              onClick={() => dialogRef.current?.close()}
              type="button"
            >
              閉じる
            </button>
          </div>
          <div ref={hostRef} />
        </div>
        <form className="modal-backdrop" method="dialog">
          <button aria-label="閉じる" type="submit">
            閉じる
          </button>
        </form>
      </dialog>
    </>
  );
}
