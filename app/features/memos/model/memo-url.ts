export const normalizeMemoUrl = (value: string): string | null => {
  try {
    const url = new URL(value);
    if (
      (url.protocol !== "http:" && url.protocol !== "https:") ||
      url.username ||
      url.password
    ) {
      return null;
    }
    return url.href;
  } catch {
    return null;
  }
};

export const isSafeMemoUrl = (value: string): boolean =>
  normalizeMemoUrl(value) !== null;
