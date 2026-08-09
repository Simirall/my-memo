import {
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS_PER_MEMO,
} from "./attachment-constants";
import {
  type AppDb,
  getEntitlement,
  getUsage,
  PLAN_METRICS,
} from "./authorization";

export {
  attachmentContentDisposition,
  decodeAttachmentFileName,
  formatAttachmentSize,
  getAttachmentPreviewKind,
  isThumbnailContentType,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS_PER_MEMO,
  MAX_SHARED_ATTACHMENT_BYTES,
  MAX_THUMBNAIL_BYTES,
  parseMediaDimensions,
  SHARE_INTAKE_MAX_AGE_MS,
} from "./attachment-constants";

export type AttachmentQuota = {
  used: number;
  limit: number | null;
  remaining: number | null;
  maxFileBytes: number;
  maxFilesPerMemo: number;
};

export type AttachmentByteRange = {
  offset: number;
  length: number;
};

export function parseAttachmentRange(
  value: string,
  size: number,
): AttachmentByteRange | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim());
  if (!match || size <= 0) return null;

  const [, startText, endText] = match;
  if (!startText && !endText) return null;

  if (!startText) {
    const suffix = Number(endText);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return null;
    const length = Math.min(suffix, size);
    return { offset: size - length, length };
  }

  const offset = Number(startText);
  if (!Number.isSafeInteger(offset) || offset < 0 || offset >= size) {
    return null;
  }
  if (!endText) return { offset, length: size - offset };

  const requestedEnd = Number(endText);
  if (!Number.isSafeInteger(requestedEnd) || requestedEnd < offset) return null;
  const end = Math.min(requestedEnd, size - 1);
  return { offset, length: end - offset + 1 };
}

export async function getAttachmentQuota(
  db: AppDb,
  userId: string,
): Promise<AttachmentQuota | null> {
  const entitlement = await getEntitlement(
    db,
    userId,
    PLAN_METRICS.attachmentStorageBytes,
  );
  if (!entitlement) return null;

  const used = await getUsage(db, userId, PLAN_METRICS.attachmentStorageBytes);

  return {
    used,
    limit: entitlement.limit,
    remaining:
      entitlement.limit === null ? null : Math.max(entitlement.limit - used, 0),
    maxFileBytes: MAX_ATTACHMENT_BYTES,
    maxFilesPerMemo: MAX_ATTACHMENTS_PER_MEMO,
  };
}
