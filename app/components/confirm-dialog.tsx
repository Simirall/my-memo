import { useEffect, useRef, useState } from "hono/jsx";
import { afterDialogCloseAnimation } from "./dialog-close";

export type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export const ConfirmDialog = ({
  open,
  title,
  description,
  confirmLabel,
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const contentRef = useRef({ title, description, confirmLabel });
  const [, renderContent] = useState(0);
  if (open) contentRef.current = { title, description, confirmLabel };
  const content = contentRef.current;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      openerRef.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      dialog.showModal();
      cancelButtonRef.current?.focus();
      return;
    }

    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || "closedBy" in HTMLDialogElement.prototype) return;

    const closeFromBackdrop = (event: MouseEvent) => {
      if (event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      const isDialogContent =
        rect.top <= event.clientY &&
        event.clientY <= rect.bottom &&
        rect.left <= event.clientX &&
        event.clientX <= rect.right;
      if (!isDialogContent) dialog.close();
    };

    dialog.addEventListener("click", closeFromBackdrop);
    return () => dialog.removeEventListener("click", closeFromBackdrop);
  }, []);

  const restoreFocus = () => {
    if (openerRef.current?.isConnected) openerRef.current.focus();
    openerRef.current = null;
  };

  return (
    <dialog
      aria-label={content.title}
      className="modal modal-middle"
      closedby="any"
      onCancel={(event: Event) => {
        event.preventDefault();
        onCancel();
      }}
      onClose={() => {
        if (open) onCancel();
        const dialog = dialogRef.current;
        if (dialog) {
          afterDialogCloseAnimation(dialog, () => {
            contentRef.current = { title, description, confirmLabel };
            renderContent((value) => value + 1);
            restoreFocus();
          });
        }
      }}
      ref={dialogRef}
    >
      <div className="modal-box">
        <h2 className="font-bold text-lg">{content.title}</h2>
        <p className="mt-3 whitespace-pre-wrap text-base-content/80">
          {content.description}
        </p>
        <div className="modal-action">
          <button
            className="btn"
            onClick={onCancel}
            ref={cancelButtonRef}
            type="button"
          >
            キャンセル
          </button>
          <button
            className={destructive ? "btn btn-error" : "btn"}
            onClick={onConfirm}
            type="button"
          >
            {content.confirmLabel}
          </button>
        </div>
      </div>
      <button
        aria-label={`${content.title}をキャンセル`}
        className="modal-backdrop"
        onClick={onCancel}
        type="button"
      >
        キャンセル
      </button>
    </dialog>
  );
};
