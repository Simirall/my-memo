export type LinkPreviewCardType = "summary" | "summary_large_image";

export type LinkPreviewMetadata = {
  title: string;
  description: string | null;
  imageUrl: string | null;
  cardType: LinkPreviewCardType;
};

const normalizeText = (value: string | undefined) => {
  if (!value) return null;
  const normalized = decodeHtmlEntities(value).replace(/\s+/g, " ").trim();
  return normalized || null;
};

const decodeHtmlEntities = (value: string) =>
  value.replace(
    /&(?:#(\d+)|#x([\da-f]+)|([a-z]+));/gi,
    (match, dec, hex, name) => {
      const codePoint = dec
        ? Number.parseInt(dec, 10)
        : hex
          ? Number.parseInt(hex, 16)
          : null;
      if (codePoint !== null) {
        try {
          return String.fromCodePoint(codePoint);
        } catch {
          return match;
        }
      }
      const named: Record<string, string> = {
        amp: "&",
        apos: "'",
        gt: ">",
        lt: "<",
        nbsp: " ",
        quot: '"',
      };
      return named[String(name).toLowerCase()] ?? match;
    },
  );

const parseAttributes = (tag: string) => {
  const attributes = new Map<string, string>();
  const pattern = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
  for (const match of tag.matchAll(pattern)) {
    attributes.set(
      match[1].toLowerCase(),
      match[2] ?? match[3] ?? match[4] ?? "",
    );
  }
  return attributes;
};

const toPublicHttpUrl = (value: string | null, baseUrl: string) => {
  if (!value) return null;
  try {
    const url = new URL(value, baseUrl);
    return isPublicHttpUrl(url) ? url.href : null;
  } catch {
    return null;
  }
};

export const parseLinkPreviewMetadata = (
  html: string,
  pageUrl: string,
): LinkPreviewMetadata | null => {
  const metadata = new Map<string, string>();
  for (const tag of html.match(/<meta\s[^>]*>/gi) ?? []) {
    const attributes = parseAttributes(tag);
    const key = (attributes.get("property") ?? attributes.get("name"))
      ?.trim()
      .toLowerCase();
    const content = attributes.get("content");
    if (key && content !== undefined && !metadata.has(key)) {
      metadata.set(key, content);
    }
  }

  const title = normalizeText(
    metadata.get("og:title") ?? metadata.get("twitter:title"),
  );
  if (!title) return null;

  const description = normalizeText(
    metadata.get("og:description") ?? metadata.get("twitter:description"),
  );
  const imageUrl = toPublicHttpUrl(
    normalizeText(metadata.get("og:image") ?? metadata.get("twitter:image")),
    pageUrl,
  );
  const cardType =
    metadata.get("twitter:card")?.trim().toLowerCase() === "summary_large_image"
      ? "summary_large_image"
      : "summary";

  return { title, description, imageUrl, cardType };
};

const isPrivateIpv4 = (hostname: string) => {
  const parts = hostname.split(".").map(Number);
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return false;
  }
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 0 || b === 168)) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
};

const isPrivateIpv6 = (hostname: string) => {
  const value = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!value.includes(":")) return false;
  if (value === "::" || value === "::1") return true;
  if (/^(?:fc|fd|fe[89ab]|ff)/.test(value)) return true;
  const mappedIpv4 = value.match(/^::ffff:([\da-f]{1,4}):([\da-f]{1,4})$/);
  if (!mappedIpv4) return false;

  const high = Number.parseInt(mappedIpv4[1], 16);
  const low = Number.parseInt(mappedIpv4[2], 16);
  return isPrivateIpv4(
    [high >> 8, high & 0xff, low >> 8, low & 0xff].join("."),
  );
};

export const isPublicHttpUrl = (url: URL) => {
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  if (url.username || url.password) return false;
  const hostname = url.hostname.toLowerCase();
  if (
    !hostname ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  ) {
    return false;
  }
  return !isPrivateIpv4(hostname) && !isPrivateIpv6(hostname);
};

export const normalizeLinkPreviewUrl = (value: string) => {
  try {
    const url = new URL(value);
    if (!isPublicHttpUrl(url)) return null;
    url.hash = "";
    url.hostname = url.hostname.toLowerCase();
    if (
      (url.protocol === "http:" && url.port === "80") ||
      (url.protocol === "https:" && url.port === "443")
    ) {
      url.port = "";
    }
    return url.href;
  } catch {
    return null;
  }
};

export const getLinkPreviewRetryDelayMs = (failureCount: number) => {
  const firstDelay = 60 * 60 * 1000;
  const maximumDelay = 7 * 24 * firstDelay;
  return Math.min(
    firstDelay * 2 ** Math.max(0, failureCount - 1),
    maximumDelay,
  );
};
