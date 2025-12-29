import { useState } from "hono/jsx";
import type z from "zod";
import type { categorySchema } from "../../routes/api/categories/categoriesSchema";

export default function UrlSummaryForm({
  categories,
}: {
  categories: ReadonlyArray<z.infer<typeof categorySchema.read>>;
}) {
  const [isLoading, setIsLoading] = useState(false);

  return (
    <form
      action="/api/memos/url"
      className="flex flex-col gap-4"
      method="post"
      onSubmit={() => {
        setIsLoading(true);
      }}
    >
      <input
        className="input"
        name="url"
        placeholder="URL"
        required
        type="text"
      />
      {categories.length > 0 && (
        <select className="select" name="category">
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
          "Summarize Page"
        )}
      </button>
    </form>
  );
}
