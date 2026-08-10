import trashIcon from "@phosphor-icons/core/assets/regular/trash.svg?raw";
import { useState } from "hono/jsx";
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

  return (
    <form
      action={action}
      className="flex justify-end"
      method="post"
      onSubmit={(event) => {
        if (confirmMessage && !window.confirm(confirmMessage)) {
          event.preventDefault();
          return;
        }
        setIsLoading(true);
      }}
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
  );
};
