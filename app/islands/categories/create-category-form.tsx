import { useState } from "hono/jsx";

export const CreateCategoryForm = () => {
  const [isLoading, setIsLoading] = useState(false);

  return (
    <form
      action="/api/categories/create"
      className="flex flex-col gap-4"
      method="post"
      onSubmit={() => {
        setIsLoading(true);
      }}
    >
      <input
        className="input"
        name="name"
        placeholder="Category Name"
        required
        type="text"
      />
      <button
        className="btn"
        disabled={isLoading}
        type="submit"
      >
        {isLoading ? (
          <span className="loading loading-spinner" />
        ) : (
          "Create Memo Category"
        )}
      </button>
    </form>
  );
};
