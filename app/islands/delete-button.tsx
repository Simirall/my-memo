import { useState } from "hono/jsx";

export const DeleteButton = ({ action }: { action: string }) => {
  const [isLoading, setIsLoading] = useState(false);

  return (
    <form
      action={action}
      className="card-actions justify-end"
      method="post"
      onSubmit={() => {
        setIsLoading(true);
      }}
    >
      <button
        className="btn btn-soft btn-error"
        disabled={isLoading}
        type="submit"
      >
        {isLoading ? (
          <span className="loading loading-spinner text-error" />
        ) : (
          "🗑️"
        )}
      </button>
    </form>
  );
};
