export const getCreatedMemoListPath = (
  categoryId: string,
  sourceCategoryId: string | undefined,
) =>
  sourceCategoryId && categoryId
    ? `/categories/${encodeURIComponent(categoryId)}`
    : "/";

export const goToMemoList = (router: { push: (to: string) => Promise<void> }) =>
  router.push("/");
