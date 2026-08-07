export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
export const MAX_ATTACHMENTS_PER_MEMO = 5;
export const MAX_SHARED_ATTACHMENT_BYTES = 75 * 1024 * 1024;
export const SHARE_INTAKE_MAX_AGE_MS = 30 * 60 * 1000;

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

export function decodeAttachmentFileName(value: string | null): string {
  if (!value) return "添付ファイル";
  try {
    const decoded = decodeURIComponent(value);
    const cleaned = Array.from(decoded, (character) => {
      const code = character.charCodeAt(0);
      return character === "\\" ||
        character === "/" ||
        code < 32 ||
        code === 127
        ? "_"
        : character;
    })
      .join("")
      .trim();
    return Array.from(cleaned || "添付ファイル")
      .slice(0, 255)
      .join("");
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
