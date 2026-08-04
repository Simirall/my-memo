import { useState } from "hono/jsx";
import type z from "zod";
import { TagInput } from "../../components/tag-input";
import type { categorySchema } from "../../routes/api/categories/categoriesSchema";
import type { Tag } from "../../utils/tags";

export default function CreateMemoForm({
  categories,
  tags = [],
  error: initialError,
}: {
  categories: ReadonlyArray<z.infer<typeof categorySchema.read>>;
  tags?: ReadonlyArray<Tag>;
  error?: string;
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(initialError);

  const submit = async (event: Event) => {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    setError(undefined);
    setIsLoading(true);

    try {
      const response = await fetch(form.action, {
        method: "POST",
        body: new FormData(form),
        headers: { Accept: "application/json" },
      });
      if (response.ok) {
        window.location.assign("/");
        return;
      }
      const payload = (await response.json()) as { message?: string };
      setError(payload.message ?? "メモを保存できませんでした。");
    } catch {
      setError("通信に失敗しました。もう一度お試しください。");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form
      action="/api/memos/create"
      className="flex flex-col gap-4"
      method="post"
      onSubmit={submit}
    >
      {error && (
        <div aria-live="polite" className="alert alert-error" role="alert">
          {error}
        </div>
      )}
      <label className="flex flex-col gap-1" htmlFor="memo-title">
        Title
        <input
          className="input"
          id="memo-title"
          maxLength={255}
          name="title"
          required
          type="text"
        />
      </label>
      <label className="flex flex-col gap-1" htmlFor="memo-content">
        Content
        <textarea
          className="textarea min-h-40"
          id="memo-content"
          maxLength={10000}
          name="content"
          required
        />
      </label>
      <label className="flex flex-col gap-1" htmlFor="memo-url">
        URL (optional)
        <input className="input" id="memo-url" name="url" type="url" />
      </label>
      {categories.length > 0 && (
        <label className="flex flex-col gap-1" htmlFor="memo-category">
          Category
          <select className="select" id="memo-category" name="categoryId">
            <option value="">Select Category</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="flex flex-col gap-1" htmlFor="memo-tags">
        Tags
        <TagInput availableTags={tags} inputId="memo-tags" />
      </label>
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
