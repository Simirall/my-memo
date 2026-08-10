export const SHARE_STORAGE_KEY = "my-memo.pending-share";
export const SHARE_MAX_AGE_MS = 30 * 60 * 1000;
export const MAX_MEMO_TITLE_LENGTH = 255;
export const MAX_MEMO_CONTENT_LENGTH = 10_000;

export type PendingShare = {
  title: string;
  text: string;
  url: string;
  receivedAt: number;
};

export type SharedMemoPrefill = {
  title: string;
  content: string;
  url?: string;
  titleTruncated: boolean;
  contentTruncated: boolean;
};

export type MediaShareFile = {
  fileName: string;
  contentType: string;
  sizeBytes: number;
};

export type ShareDestination =
  | { kind: "url"; url: string; memoPrefill: SharedMemoPrefill }
  | { kind: "memo"; prefill: SharedMemoPrefill };

const HTTP_URL_PATTERN = /https?:\/\/[^\s<>"']+/gi;
const TRAILING_URL_PUNCTUATION = /[.,!?;:)}\]]+$/;

const trimUrlCandidate = (value: string) =>
  value.trim().replace(TRAILING_URL_PUNCTUATION, "");

export const parseHttpUrl = (value: string): string | undefined => {
  const candidate = trimUrlCandidate(value);
  if (!candidate) return undefined;

  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return undefined;
    }
    return parsed.href;
  } catch {
    return undefined;
  }
};

export const extractHttpUrls = (value: string): string[] => {
  const urls = value.match(HTTP_URL_PATTERN) ?? [];
  const unique = new Map<string, string>();

  for (const candidate of urls) {
    const parsed = parseHttpUrl(candidate);
    if (parsed) unique.set(parsed, parsed);
  }

  return [...unique.values()];
};

const truncate = (value: string, maxLength: number) => ({
  value: value.slice(0, maxLength),
  truncated: value.length > maxLength,
});

const firstNonEmptyLine = (value: string) =>
  value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean) ?? "";

const createMemoPrefill = (input: {
  title?: string;
  content?: string;
  url?: string;
}): SharedMemoPrefill => {
  const titleValue = truncate(
    input.title || firstNonEmptyLine(input.content ?? "") || "共有メモ",
    MAX_MEMO_TITLE_LENGTH,
  );
  const contentValue = truncate(input.content ?? "", MAX_MEMO_CONTENT_LENGTH);

  return {
    title: titleValue.value,
    content: contentValue.value,
    url: input.url,
    titleTruncated: titleValue.truncated,
    contentTruncated: contentValue.truncated,
  };
};

export const createMediaSharePrefill = (
  pendingShare: Pick<PendingShare, "title" | "text" | "url">,
  files: ReadonlyArray<MediaShareFile>,
): SharedMemoPrefill => {
  const fileNames = files.map((file) => file.fileName);
  const explicitUrl = parseHttpUrl(pendingShare.url);
  const textUrls = extractHttpUrls(pendingShare.text);
  const allUrls = new Map<string, string>();
  if (explicitUrl) allUrls.set(explicitUrl, explicitUrl);
  for (const url of textUrls) allUrls.set(url, url);

  return createMemoPrefill({
    title:
      pendingShare.title ||
      firstNonEmptyLine(pendingShare.text) ||
      fileNames[0] ||
      "共有ファイル",
    content: pendingShare.text || fileNames.join("\n"),
    url: allUrls.size === 1 ? [...allUrls.values()][0] : undefined,
  });
};

const isSingleUrlText = (text: string, expectedUrl?: string) => {
  const matches = text.match(HTTP_URL_PATTERN) ?? [];
  const urls = extractHttpUrls(text);
  if (matches.length !== 1 || urls.length !== 1) return false;
  const withoutUrl = text.replace(HTTP_URL_PATTERN, "").trim();
  return !withoutUrl && (!expectedUrl || urls[0] === expectedUrl);
};

export const normalizePendingShare = (input: {
  title?: string | null;
  text?: string | null;
  url?: string | null;
  receivedAt?: number;
}): PendingShare => ({
  title: typeof input.title === "string" ? input.title.trim() : "",
  text: typeof input.text === "string" ? input.text.trim() : "",
  url: typeof input.url === "string" ? input.url.trim() : "",
  receivedAt:
    typeof input.receivedAt === "number" && Number.isFinite(input.receivedAt)
      ? input.receivedAt
      : Date.now(),
});

export const getShareDestination = (
  pendingShare: PendingShare,
): ShareDestination | { kind: "invalid" } => {
  const title = pendingShare.title;
  const text = pendingShare.text;
  const explicitUrl = parseHttpUrl(pendingShare.url);
  const textUrls = extractHttpUrls(text);

  if (
    (explicitUrl && (!text || isSingleUrlText(text, explicitUrl))) ||
    (!explicitUrl && isSingleUrlText(text))
  ) {
    const url = explicitUrl ?? textUrls[0];
    if (!url) return { kind: "invalid" };
    const parsedUrl = new URL(url);
    return {
      kind: "url",
      url,
      memoPrefill: createMemoPrefill({
        title: title || parsedUrl.host,
        url,
      }),
    };
  }

  if (!title && !text && !explicitUrl) return { kind: "invalid" };

  const allUrls = new Map<string, string>();
  if (explicitUrl) allUrls.set(explicitUrl, explicitUrl);
  for (const url of textUrls) allUrls.set(url, url);

  const contentSource = text || title;

  return {
    kind: "memo",
    prefill: createMemoPrefill({
      title,
      content: contentSource,
      url: allUrls.size === 1 ? [...allUrls.values()][0] : undefined,
    }),
  };
};

export const isPendingShare = (value: unknown): value is PendingShare => {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<PendingShare>;
  return (
    typeof candidate.title === "string" &&
    typeof candidate.text === "string" &&
    typeof candidate.url === "string" &&
    typeof candidate.receivedAt === "number" &&
    Number.isFinite(candidate.receivedAt)
  );
};

export const isShareFresh = (pendingShare: PendingShare, now = Date.now()) =>
  now - pendingShare.receivedAt >= 0 &&
  now - pendingShare.receivedAt <= SHARE_MAX_AGE_MS;
