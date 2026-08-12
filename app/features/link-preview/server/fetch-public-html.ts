import {
  isPublicHttpUrl,
  normalizeLinkPreviewUrl,
} from "@/features/link-preview/model/link-preview";

export const PUBLIC_HTML_MAX_BYTES = 1024 * 1024;
export const PUBLIC_HTML_FETCH_TIMEOUT_MS = 8_000;
export const PUBLIC_HTML_MAX_REDIRECTS = 5;

export type PublicHtmlFetchErrorCode =
  | "invalid_url"
  | "redirect"
  | "response"
  | "content_type"
  | "too_large";

export class PublicHtmlFetchError extends Error {
  constructor(
    message: string,
    readonly code: PublicHtmlFetchErrorCode,
  ) {
    super(message);
    this.name = "PublicHtmlFetchError";
  }
}

const isRedirect = (status: number) =>
  status === 301 ||
  status === 302 ||
  status === 303 ||
  status === 307 ||
  status === 308;

const readBoundedBody = async (response: Response) => {
  const declaredLength = Number(response.headers.get("content-length"));
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > PUBLIC_HTML_MAX_BYTES
  ) {
    throw new PublicHtmlFetchError("HTMLが大きすぎます。", "too_large");
  }
  if (!response.body) {
    throw new PublicHtmlFetchError("HTML本文がありません。", "response");
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > PUBLIC_HTML_MAX_BYTES) {
        await reader.cancel();
        throw new PublicHtmlFetchError("HTMLが大きすぎます。", "too_large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
};

export const fetchPublicHtml = async (
  inputUrl: string,
  fetcher: typeof fetch = fetch,
) => {
  const normalizedUrl = normalizeLinkPreviewUrl(inputUrl);
  if (!normalizedUrl) {
    throw new PublicHtmlFetchError("公開URLではありません。", "invalid_url");
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    PUBLIC_HTML_FETCH_TIMEOUT_MS,
  );
  let currentUrl = new URL(normalizedUrl);
  try {
    for (let redirects = 0; ; redirects += 1) {
      const response = await fetcher(currentUrl, {
        headers: { Accept: "text/html,application/xhtml+xml" },
        redirect: "manual",
        signal: controller.signal,
      });
      if (isRedirect(response.status)) {
        if (redirects >= PUBLIC_HTML_MAX_REDIRECTS) {
          throw new PublicHtmlFetchError(
            "リダイレクト回数が上限を超えました。",
            "redirect",
          );
        }
        const location = response.headers.get("location");
        if (!location) {
          throw new PublicHtmlFetchError(
            "リダイレクト先がありません。",
            "redirect",
          );
        }
        const redirectedUrl = new URL(location, currentUrl);
        if (!isPublicHttpUrl(redirectedUrl)) {
          throw new PublicHtmlFetchError(
            "公開URL以外へリダイレクトされました。",
            "invalid_url",
          );
        }
        currentUrl = redirectedUrl;
        continue;
      }
      if (!response.ok) {
        throw new PublicHtmlFetchError(
          `リンク先がHTTP ${response.status}を返しました。`,
          "response",
        );
      }
      const contentType = response.headers.get("content-type") ?? "";
      if (
        !/^(?:text\/html|application\/xhtml\+xml)(?:;|$)/i.test(contentType)
      ) {
        throw new PublicHtmlFetchError(
          "リンク先がHTMLではありません。",
          "content_type",
        );
      }
      return {
        bytes: await readBoundedBody(response),
        headers: response.headers,
        finalUrl: currentUrl.href,
      };
    }
  } finally {
    clearTimeout(timeout);
  }
};
