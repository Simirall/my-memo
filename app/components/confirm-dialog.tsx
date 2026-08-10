import { useEffect, useRef } from "hono/jsx";

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
      aria-label={title}
      className="modal modal-middle"
      closedby="any"
      onCancel={(event: Event) => {
        event.preventDefault();
        onCancel();
      }}
      onClose={() => {
        if (open) onCancel();
        restoreFocus();
      }}
      ref={dialogRef}
    >
      <div className="modal-box">
        <h2 className="font-bold text-lg">{title}</h2>
        <p className="mt-3 whitespace-pre-wrap text-base-content/80">
          {description}
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
            {confirmLabel}
          </button>
        </div>
      </div>
      <button
        aria-label={`${title}をキャンセル`}
        className="modal-backdrop"
        onClick={onCancel}
        type="button"
      >
        キャンセル
      </button>
    </dialog>
  );
};
