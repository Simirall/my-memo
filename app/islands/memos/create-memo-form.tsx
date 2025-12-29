import { useState } from "hono/jsx";
import type z from "zod";
import type { categorySchema } from "../../routes/api/categories/categoriesSchema";

export default function CreateMemoForm({
  categories,
}: {
  categories: ReadonlyArray<z.infer<typeof categorySchema.read>>;
}) {
  const [isLoading, setIsLoading] = useState(false);

  return (
    <form
      action="/api/memos/create"
      className="flex flex-col gap-4"
      method="post"
      onSubmit={() => {
        setIsLoading(true);
      }}
    >
      <input
        className="input"
        name="title"
        placeholder="Title"
        required
        type="text"
      />
      <textarea
        className="textarea"
        name="content"
        placeholder="Content"
        required
      />
      <input className="input" name="url" placeholder="URL" type="text" />
      {categories.length > 0 && (
        <select className="select" name="categoryId">
          <option value="">Select Category</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      )}
      <button className="btn" disabled={isLoading} type="submit">
        {isLoading ? (
          <span className="loading loading-spinner" />
        ) : (
          "Create Memo"
        )}
      </button>
    </form>
  );
}
