import trashIcon from "@phosphor-icons/core/assets/regular/trash.svg?raw";
import { useRef, useState } from "hono/jsx";
import { ConfirmDialog } from "../components/confirm-dialog";
import { PhosphorIcon } from "../components/phosphor-icon";

export const DeleteButton = ({
  action,
  confirmMessage,
  label = "削除",
}: {
  action: string;
  confirmMessage?: string;
  label?: string;
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const confirmedRef = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <>
      <form
        action={action}
        className="flex justify-end"
        method="post"
        onSubmit={(event) => {
          if (confirmMessage && !confirmedRef.current) {
            event.preventDefault();
            setIsConfirming(true);
            return;
          }
          confirmedRef.current = false;
          setIsLoading(true);
        }}
        ref={formRef}
      >
        <button
          aria-label={label}
          className="btn btn-soft btn-error"
          disabled={isLoading}
          type="submit"
        >
          {isLoading ? (
            <span className="loading loading-spinner text-error" />
          ) : (
            <PhosphorIcon svg={trashIcon} />
          )}
        </button>
      </form>
      {confirmMessage && (
        <ConfirmDialog
          confirmLabel="削除"
          description={confirmMessage}
          destructive
          onCancel={() => setIsConfirming(false)}
          onConfirm={() => {
            confirmedRef.current = true;
            setIsConfirming(false);
            formRef.current?.requestSubmit();
          }}
          open={isConfirming}
          title="削除の確認"
        />
      )}
    </>
  );
};
