import { useState } from "hono/jsx";

export const CreateCategoryForm = () => {
  const [isLoading, setIsLoading] = useState(false);

  return (
    <form
      action="/api/categories/create"
      className="rounded-box bg-base-200 p-4"
      method="post"
      onSubmit={() => {
        setIsLoading(true);
      }}
    >
      <fieldset className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <legend className="sr-only">カテゴリーを追加</legend>
        <label className="flex flex-1 flex-col gap-1" htmlFor="category-name">
          カテゴリー名
          <input
            aria-describedby="category-name-help"
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
  );
};
