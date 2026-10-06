export const getCreatedMemoListPath = (
  categoryId: string,
  sourceCategoryId: string | undefined,
) =>
  sourceCategoryId && categoryId
    ? `/categories/${encodeURIComponent(categoryId)}`
    : "/";

export const goToMemoList = () => window.location.assign("/");
