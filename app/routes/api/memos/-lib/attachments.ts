export const cleanupR2Keys = async (
  bucket: R2Bucket,
  keys: readonly string[],
  context: { memoId: string; event: string },
) => {
  const results = await Promise.allSettled(
    keys.map((key) => bucket.delete(key)),
  );
  for (const result of results) {
    if (result.status === "rejected") {
      console.error(
        JSON.stringify({
          event: context.event,
          memoId: context.memoId,
          errorType:
            result.reason instanceof Error
              ? result.reason.name
              : "UnknownError",
        }),
      );
    }
  }
};

export const getEditAttachmentPrefix = (userId: string, memoId: string) =>
  `users/${userId}/memos/${memoId}/edits/`;

export const isEditAttachmentToken = (
  token: string,
  userId: string,
  memoId: string,
) => {
  const prefix = getEditAttachmentPrefix(userId, memoId);
  const suffix = token.startsWith(prefix) ? token.slice(prefix.length) : "";
  return suffix.split("/").length === 2 && suffix.split("/").every(Boolean);
};
