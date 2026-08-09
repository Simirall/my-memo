import {
  getAttachmentPreviewKind,
  isThumbnailContentType,
  MAX_ATTACHMENT_BYTES,
  MAX_THUMBNAIL_BYTES,
  parseMediaDimensions,
  sanitizeAttachmentFileName,
} from "./attachment-constants";
import type { GeneratedThumbnail } from "./image-thumbnail";

export type ParsedAttachmentUpload = {
  original: File;
  thumbnail: File | null;
  fileName: string;
  contentType: string;
  mediaDimensions: { width: number; height: number } | null;
};

export const buildAttachmentUploadForm = (
  original: File,
  thumbnail: GeneratedThumbnail | null,
  dimensions: { width: number; height: number } | null,
) => {
  const form = new FormData();
  form.set("original", original, original.name);
  if (thumbnail) {
    const extension = thumbnail.blob.type === "image/avif" ? "avif" : "webp";
    form.set(
      "thumbnail",
      thumbnail.blob,
      `${original.name}.thumbnail.${extension}`,
    );
  }
  if (dimensions) {
    form.set("mediaWidth", String(dimensions.width));
    form.set("mediaHeight", String(dimensions.height));
  }
  return form;
};

export const parseAttachmentUploadForm = async (
  request: Request,
): Promise<ParsedAttachmentUpload> => {
  const form = await request.formData();
  const original = form.get("original");
  const thumbnailValue = form.get("thumbnail");
  if (!(original instanceof File) || original.size === 0) {
    throw new Error("ファイルが空です。");
  }
  if (original.size > MAX_ATTACHMENT_BYTES) {
    throw new Error("1ファイルは25 MiB以下にしてください。");
  }

  const contentType =
    original.type.split(";", 1)[0].trim().toLowerCase().slice(0, 255) ||
    "application/octet-stream";
  const kind = getAttachmentPreviewKind(contentType);
  const thumbnail = thumbnailValue instanceof File ? thumbnailValue : null;
  if (kind === "image") {
    if (!thumbnail || thumbnail.size === 0) {
      throw new Error("画像のサムネイルがありません。");
    }
    if (
      thumbnail.size > MAX_THUMBNAIL_BYTES ||
      !isThumbnailContentType(thumbnail.type)
    ) {
      throw new Error("画像のサムネイルが不正です。");
    }
  } else if (thumbnail) {
    throw new Error("画像以外にはサムネイルを指定できません。");
  }

  const mediaWidth = form.get("mediaWidth");
  const mediaHeight = form.get("mediaHeight");
  const mediaDimensions = parseMediaDimensions(
    contentType,
    typeof mediaWidth === "string" ? mediaWidth : null,
    typeof mediaHeight === "string" ? mediaHeight : null,
  );
  return {
    original,
    thumbnail,
    fileName: sanitizeAttachmentFileName(original.name),
    contentType,
    mediaDimensions,
  };
};
