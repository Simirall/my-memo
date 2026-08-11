import {
  isPublicHttpUrl,
  type LinkPreviewMetadata,
  normalizeLinkPreviewUrl,
  parseLinkPreviewMetadata,
} from "@/features/link-preview/model/link-preview";
import { decodeLinkPreviewHtml } from "./decode-html";

export const LINK_PREVIEW_HTML_MAX_BYTES = 1024 * 1024;
export const LINK_PREVIEW_FETCH_TIMEOUT_MS = 8_000;
export const LINK_PREVIEW_MAX_REDIRECTS = 5;

export class LinkPreviewFetchError extends Error {
  constructor(
    message: string,
    readonly code:
      | "invalid_url"
      | "redirect"
      | "response"
      | "content_type"
      | "too_large"
      | "metadata",
  ) {
    super(message);
    this.name = "LinkPreviewFetchError";
  }
}

const readBoundedBody = async (response: Response) => {
  const declaredLength = Number(response.headers.get("content-length"));
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > LINK_PREVIEW_HTML_MAX_BYTES
  ) {
    throw new LinkPreviewFetchError("HTMLが大きすぎます。", "too_large");
  }
  if (!response.body) {
    throw new LinkPreviewFetchError("HTML本文がありません。", "response");
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > LINK_PREVIEW_HTML_MAX_BYTES) {
        await reader.cancel();
        throw new LinkPreviewFetchError("HTMLが大きすぎます。", "too_large");
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

const isRedirect = (status: number) =>
  status === 301 ||
  status === 302 ||
  status === 303 ||
  status === 307 ||
  status === 308;

export const fetchLinkPreview = async (
  inputUrl: string,
  fetcher: typeof fetch = fetch,
): Promise<LinkPreviewMetadata> => {
  const normalizedUrl = normalizeLinkPreviewUrl(inputUrl);
  if (!normalizedUrl) {
    throw new LinkPreviewFetchError("公開URLではありません。", "invalid_url");
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    LINK_PREVIEW_FETCH_TIMEOUT_MS,
  );
  let currentUrl = new URL(normalizedUrl);

  try {
    for (let redirects = 0; ; redirects += 1) {
      const response = await fetcher(currentUrl, {
        headers: {
          Accept: "text/html,application/xhtml+xml",
        },
        redirect: "manual",
        signal: controller.signal,
      });

      if (isRedirect(response.status)) {
        if (redirects >= LINK_PREVIEW_MAX_REDIRECTS) {
          throw new LinkPreviewFetchError(
            "リダイレクト回数が上限を超えました。",
            "redirect",
          );
        }
        const location = response.headers.get("location");
        if (!location) {
          throw new LinkPreviewFetchError(
            "リダイレクト先がありません。",
            "redirect",
          );
        }
        const redirectedUrl = new URL(location, currentUrl);
        if (!isPublicHttpUrl(redirectedUrl)) {
          throw new LinkPreviewFetchError(
            "公開URL以外へリダイレクトされました。",
            "invalid_url",
          );
        }
        currentUrl = redirectedUrl;
        continue;
      }

      if (!response.ok) {
        throw new LinkPreviewFetchError(
          `リンク先がHTTP ${response.status}を返しました。`,
          "response",
        );
      }
      const contentType = response.headers.get("content-type") ?? "";
      if (
        !/^(?:text\/html|application\/xhtml\+xml)(?:;|$)/i.test(contentType)
      ) {
        throw new LinkPreviewFetchError(
          "リンク先がHTMLではありません。",
          "content_type",
        );
      }

      const bytes = await readBoundedBody(response);
      const html = decodeLinkPreviewHtml(bytes, response.headers);
      const metadata = parseLinkPreviewMetadata(html, currentUrl.href);
      if (!metadata) {
        throw new LinkPreviewFetchError(
          "OGPタイトルを取得できませんでした。",
          "metadata",
        );
      }
      return metadata;
    }
  } finally {
    clearTimeout(timeout);
  }
};
