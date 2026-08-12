export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
export const MAX_THUMBNAIL_BYTES = 1024 * 1024;
export const MAX_ATTACHMENTS_PER_MEMO = 5;
export const MAX_SHARED_ATTACHMENT_BYTES = 75 * 1024 * 1024;
export const SHARE_INTAKE_MAX_AGE_MS = 30 * 60 * 1000;
export const MAX_MEDIA_DIMENSION = 100_000;

export type AttachmentPreviewKind = "image" | "audio" | "video";

const previewTypes: ReadonlyMap<string, AttachmentPreviewKind> = new Map([
  ["image/jpeg", "image"],
  ["image/png", "image"],
  ["image/gif", "image"],
  ["image/webp", "image"],
  ["image/avif", "image"],
  ["audio/mpeg", "audio"],
  ["audio/ogg", "audio"],
  ["audio/wav", "audio"],
  ["audio/wave", "audio"],
  ["audio/x-wav", "audio"],
  ["audio/mp4", "audio"],
  ["audio/webm", "audio"],
  ["audio/x-m4a", "audio"],
  ["audio/aac", "audio"],
  ["video/mp4", "video"],
  ["video/webm", "video"],
  ["video/ogg", "video"],
  ["video/quicktime", "video"],
]);

export function getAttachmentPreviewKind(
  contentType: string,
): AttachmentPreviewKind | null {
  return (
    previewTypes.get(contentType.split(";", 1)[0].trim().toLowerCase()) ?? null
  );
}

export const isThumbnailContentType = (contentType: string) =>
  contentType === "image/avif" || contentType === "image/webp";

export type MediaDimensions = { width: number; height: number };

export function areValidMediaDimensions(
  dimensions: MediaDimensions | null | undefined,
): dimensions is MediaDimensions {
  return Boolean(
    dimensions &&
      Number.isSafeInteger(dimensions.width) &&
      Number.isSafeInteger(dimensions.height) &&
      dimensions.width > 0 &&
      dimensions.height > 0 &&
      dimensions.width <= MAX_MEDIA_DIMENSION &&
      dimensions.height <= MAX_MEDIA_DIMENSION,
  );
}

export function parseMediaDimensions(
  contentType: string,
  widthHeader: string | null | undefined,
  heightHeader: string | null | undefined,
): MediaDimensions | null {
  const kind = getAttachmentPreviewKind(contentType);
  const widthProvided = widthHeader !== null && widthHeader !== undefined;
  const heightProvided = heightHeader !== null && heightHeader !== undefined;
  if (kind !== "image" && kind !== "video") {
    if (widthProvided || heightProvided) {
      throw new Error("音声・その他の添付には寸法を指定できません。");
    }
    return null;
  }
  if (!widthProvided || !heightProvided) {
    throw new Error("画像・動画の寸法が不足しています。");
  }
  const width = Number(widthHeader);
  const height = Number(heightHeader);
  if (!areValidMediaDimensions({ width, height })) {
    throw new Error("画像・動画の寸法が不正です。");
  }
  return { width, height };
}

export function sanitizeAttachmentFileName(value: string | null): string {
  const cleaned = Array.from(value ?? "", (character) => {
    const code = character.charCodeAt(0);
    return character === "\\" || character === "/" || code < 32 || code === 127
      ? "_"
      : character;
  })
    .join("")
    .trim();
  return Array.from(cleaned || "添付ファイル")
    .slice(0, 255)
    .join("");
}

export function decodeAttachmentFileName(value: string | null): string {
  if (!value) return "添付ファイル";
  try {
    return sanitizeAttachmentFileName(decodeURIComponent(value));
  } catch {
    return "添付ファイル";
  }
}

export function attachmentContentDisposition(
  fileName: string,
  inline: boolean,
): string {
  const encoded = encodeURIComponent(fileName)
    .replace(/'/g, "%27")
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29");
  return `${inline ? "inline" : "attachment"}; filename="attachment"; filename*=UTF-8''${encoded}`;
}

export function formatAttachmentSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
