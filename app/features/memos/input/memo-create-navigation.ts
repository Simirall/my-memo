export const getCreatedMemoListPath = (categoryId: string) =>
  categoryId ? `/categories/${encodeURIComponent(categoryId)}` : "/";
