import { useState } from "hono/jsx";

export const DeleteButton = ({ memoId }: { memoId: string }) => {
  const [isLoading, setIsLoading] = useState(false);

  return (
    <form
      action={`/api/memos/delete/${memoId}`}
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
