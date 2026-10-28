"use client";

import listBulletsIcon from "@phosphor-icons/core/assets/regular/list-bullets.svg?raw";
import squaresFourIcon from "@phosphor-icons/core/assets/regular/squares-four.svg?raw";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { PhosphorIcon } from "@/components/phosphor-icon";

type View = "card" | "list";

export default function MemoListViewController({
  listPath,
  cards,
  table,
  controls,
}: {
  listPath: string;
  cards: { id: string; content: ReactNode }[];
  table: ReactNode;
  controls: ReactNode;
}) {
  const [view, setView] = useState<View>("card");
  const [selectedId, setSelectedId] = useState<string>();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const storageKey = `my-memo.memo-list-view:${listPath}`;
  useEffect(() => {
    try {
      setView(localStorage.getItem(storageKey) === "list" ? "list" : "card");
    } catch {}
  }, [storageKey]);
  useEffect(() => {
    if (selectedId && cards.some((card) => card.id === selectedId))
      dialogRef.current?.showModal();
    else dialogRef.current?.close();
  }, [selectedId, cards]);
  const changeView = (next: View) => {
    if (dialogRef.current?.open) dialogRef.current.close();
    setView(next);
    try {
      localStorage.setItem(storageKey, next);
    } catch {}
  };

  return (
    <>
      <div className="mt-4 flex items-start gap-2">
        <label className="swap swap-rotate btn btn-square shrink-0">
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
        <div className="min-w-0 flex-1">{controls}</div>
      </div>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: Delegates clicks from the native detail buttons, including keyboard activation. */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: Native detail buttons already provide keyboard activation. */}
      <div
        data-memo-list-content
        onClick={(event) => {
          const button = (event.target as Element).closest<HTMLButtonElement>(
            "[data-memo-detail]",
          );
          if (button) {
            triggerRef.current = button;
            setSelectedId(button.dataset.memoDetail);
          }
        }}
      >
        {view === "card" ? (
          <div
            className="grid w-full auto-rows-auto grid-cols-[repeat(auto-fit,minmax(min(100%,30rem),30rem))] items-stretch justify-center gap-4 py-4"
            data-memo-list-grid
            data-memo-list-view="card"
          >
            {cards.map((card) => (
              <div className="contents" key={card.id}>
                {card.content}
              </div>
            ))}
          </div>
        ) : (
          table
        )}
        {cards.length === 0 && (
          <p
            className="rounded-box bg-base-200 text-base-content/70 p-6 text-center"
            data-memo-list-empty
          >
            条件に一致するメモはありません。
          </p>
        )}
      </div>
      <dialog
        aria-label="メモ詳細"
        className="modal"
        onClose={(event) => {
          if (event.target !== event.currentTarget) return;
          setSelectedId(undefined);
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
          {cards.find((card) => card.id === selectedId)?.content}
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
