import { getAttachmentPreviewKind } from "./attachment-constants";
import { buildAttachmentUploadForm } from "./attachment-upload";
import {
  type GeneratedThumbnail,
  generateImageThumbnail,
} from "./image-thumbnail";
import { readMediaDimensions } from "./media-dimensions";

export type PendingAttachmentUpload = {
  file: File;
  dimensions: Awaited<ReturnType<typeof readMediaDimensions>>;
  thumbnail: GeneratedThumbnail | null;
};

export const prepareAttachmentUpload = async (
  file: File,
): Promise<PendingAttachmentUpload> => {
  const kind = getAttachmentPreviewKind(file.type);
  const [dimensions, thumbnail] = await Promise.all([
    readMediaDimensions(file, kind),
    kind === "image" ? generateImageThumbnail(file) : Promise.resolve(null),
  ]);
  return { file, dimensions, thumbnail };
};

export const getAttachmentUploadBody = (pending: PendingAttachmentUpload) =>
  buildAttachmentUploadForm(
    pending.file,
    pending.thumbnail,
    pending.dimensions,
  );
