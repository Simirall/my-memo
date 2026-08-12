import {
  type LinkPreviewMetadata,
  parseLinkPreviewMetadata,
} from "@/features/link-preview/model/link-preview";
import { decodeLinkPreviewHtml } from "./decode-html";
import {
  fetchPublicHtml,
  PUBLIC_HTML_FETCH_TIMEOUT_MS,
  PUBLIC_HTML_MAX_BYTES,
  PUBLIC_HTML_MAX_REDIRECTS,
  PublicHtmlFetchError,
} from "./fetch-public-html";

export const LINK_PREVIEW_HTML_MAX_BYTES = PUBLIC_HTML_MAX_BYTES;
export const LINK_PREVIEW_FETCH_TIMEOUT_MS = PUBLIC_HTML_FETCH_TIMEOUT_MS;
export const LINK_PREVIEW_MAX_REDIRECTS = PUBLIC_HTML_MAX_REDIRECTS;

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

export const fetchLinkPreview = async (
  inputUrl: string,
  fetcher: typeof fetch = fetch,
): Promise<LinkPreviewMetadata> => {
  try {
    const result = await fetchPublicHtml(inputUrl, fetcher);
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
