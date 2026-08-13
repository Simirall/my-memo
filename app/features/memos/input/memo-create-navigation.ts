export const getCreatedMemoListPath = (
  categoryId: string,
  sourceCategoryId: string | undefined,
) =>
  sourceCategoryId && categoryId
    ? `/categories/${encodeURIComponent(categoryId)}`
    : "/";
