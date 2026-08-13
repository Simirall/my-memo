import { useEffect, useState } from "hono/jsx";

export const CreateCategoryForm = ({
  created = false,
  error,
}: {
  created?: boolean;
  error?: string;
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [showCreated, setShowCreated] = useState(false);

  useEffect(() => {
    if (!created) return;
    history.replaceState(null, "", "/settings/categories");
    setShowCreated(true);
    const timeout = window.setTimeout(() => setShowCreated(false), 4000);
    return () => window.clearTimeout(timeout);
  }, [created]);

  return (
    <>
      <form
        action="/api/categories/create"
        className="rounded-box bg-base-200 p-4"
        method="post"
        onSubmit={() => {
          setIsLoading(true);
        }}
      >
        {error && (
          <div
            aria-live="polite"
            className="alert alert-error mb-3"
            id="category-name-error"
            role="alert"
          >
            {error}
          </div>
        )}
        <fieldset className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <legend className="sr-only">カテゴリーを追加</legend>
          <label className="flex flex-1 flex-col gap-1" htmlFor="category-name">
            <span>
              カテゴリー名
              <span aria-hidden="true" className="text-error">
                *
              </span>
            </span>
            <input
              aria-describedby={
                error
                  ? "category-name-help category-name-error"
                  : "category-name-help"
              }
              className="input w-full"
              id="category-name"
              maxLength={50}
              name="name"
              required
              type="text"
            />
          </label>
          <button className="btn" disabled={isLoading} type="submit">
            {isLoading ? <span className="loading loading-spinner" /> : "追加"}
          </button>
        </fieldset>
        <p className="text-base-content/70 text-sm" id="category-name-help">
          50文字以内で入力してください。
        </p>
      </form>
      {showCreated && (
        <div className="toast toast-end toast-bottom z-50">
          <div
            aria-atomic="true"
            aria-live="polite"
            className="alert alert-soft alert-success shadow-lg"
            role="status"
          >
            カテゴリーを追加しました。
          </div>
        </div>
      )}
    </>
  );
};
