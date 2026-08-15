import {
  type LinkPreviewMetadata,
  parseLinkPreviewMetadata,
} from "@/features/link-preview/model/link-preview";
import { decodeLinkPreviewHtml } from "./decode-html";
import {
  fetchPublicHtml,
  PUBLIC_HTML_FETCH_TIMEOUT_MS,
  PUBLIC_HTML_MAX_BYTES,
  PublicHtmlFetchError,
} from "./fetch-public-html";

export const LINK_PREVIEW_HTML_MAX_BYTES = PUBLIC_HTML_MAX_BYTES;
export const LINK_PREVIEW_FETCH_TIMEOUT_MS = PUBLIC_HTML_FETCH_TIMEOUT_MS;
const FIXUPX_USER_AGENT = "MyMemoBot/1.0 (+https://my-memo.partial.cc)";

const getOgpSourceUrl = (inputUrl: string) => {
  try {
    const url = new URL(inputUrl);
    if (
      url.hostname === "x.com" &&
      /^\/[^/]+\/status\/\d+(?:\/.*)?$/.test(url.pathname)
    ) {
      url.hostname = "fixupx.com";
    }
    return url.href;
  } catch {
    return inputUrl;
  }
};

const withFixupXUserAgent =
  (fetcher: typeof fetch): typeof fetch =>
  (input, init) => {
    const url = new URL(
      input instanceof Request ? input.url : input.toString(),
    );
    if (url.hostname !== "fixupx.com") return fetcher(input, init);

    const headers = new Headers(init?.headers);
    headers.set("User-Agent", FIXUPX_USER_AGENT);
    return fetcher(input, { ...init, headers });
  };

class LinkPreviewFetchError extends Error {
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

export const fetchLinkPreview = async (
  inputUrl: string,
  fetcher: typeof fetch = fetch,
): Promise<LinkPreviewMetadata> => {
  try {
    const result = await fetchPublicHtml(
      getOgpSourceUrl(inputUrl),
      withFixupXUserAgent(fetcher),
    );
    const html = decodeLinkPreviewHtml(result.bytes, result.headers);
    const metadata = parseLinkPreviewMetadata(html, result.finalUrl);
    if (!metadata) {
      throw new LinkPreviewFetchError(
        "OGPタイトルを取得できませんでした。",
        "metadata",
      );
    }
    return metadata;
  } catch (error) {
    if (error instanceof PublicHtmlFetchError) {
      throw new LinkPreviewFetchError(error.message, error.code);
    }
    throw error;
  }
};
