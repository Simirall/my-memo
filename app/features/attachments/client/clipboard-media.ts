import { getAttachmentPreviewKind } from "@/features/attachments/model/attachment-constants";

export type ClipboardRejectionReason =
  | "unsupported"
  | "file-size"
  | "file-count"
  | "quota"
  | "dimensions";

export type ClipboardRejection = {
  file: File;
  reason: ClipboardRejectionReason;
};

export type ClipboardMediaSelection = {
  accepted: ReadonlyArray<File>;
  rejected: ReadonlyArray<ClipboardRejection>;
};

export function getClipboardFiles(event: ClipboardEvent): File[] {
  return Array.from(event.clipboardData?.items ?? [])
    .filter((item) => item.kind === "file")
    .map((item) => item.getAsFile())
    .filter((file): file is File => file !== null);
}

export function hasSupportedClipboardMedia(
  files: ReadonlyArray<File>,
): boolean {
  return files.some((file) => getAttachmentPreviewKind(file.type) !== null);
}

export function selectClipboardMedia(
  files: ReadonlyArray<File>,
  options: {
    currentCount: number;
    currentBytes: number;
    maxFiles: number;
    maxFileBytes: number;
    availableBytes: number | null;
  },
): ClipboardMediaSelection {
  const accepted: File[] = [];
  const rejected: ClipboardRejection[] = [];
  let count = options.currentCount;
  let bytes = options.currentBytes;

  for (const file of files) {
    if (getAttachmentPreviewKind(file.type) === null) {
      rejected.push({ file, reason: "unsupported" });
      continue;
    }
    if (file.size > options.maxFileBytes) {
      rejected.push({ file, reason: "file-size" });
      continue;
    }
    if (count >= options.maxFiles) {
      rejected.push({ file, reason: "file-count" });
      continue;
    }
    if (
      options.availableBytes !== null &&
      bytes + file.size > options.availableBytes
    ) {
      rejected.push({ file, reason: "quota" });
      continue;
    }
    accepted.push(file);
    count += 1;
    bytes += file.size;
  }

  return { accepted, rejected };
}

export function shouldCaptureClipboardPaste(
  event: ClipboardEvent,
  contentElement: HTMLTextAreaElement | null,
): boolean {
  const isEditable = (element: Element | null) =>
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement ||
    (element instanceof HTMLElement && element.isContentEditable);
  const target = event.target instanceof Element ? event.target : null;
  const active = document.activeElement;

  if (target === contentElement || active === contentElement) return true;
  if (isEditable(target) || isEditable(active)) return false;
  return true;
}

export function formatClipboardRejections(
  rejected: ReadonlyArray<ClipboardRejection>,
): string {
  const counts = new Map<ClipboardRejectionReason, number>();
  for (const { reason } of rejected) {
    counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }
  const labels: ReadonlyArray<readonly [ClipboardRejectionReason, string]> = [
    ["unsupported", "非対応形式"],
    ["file-size", "ファイルサイズ超過"],
    ["file-count", "添付件数超過"],
    ["quota", "添付容量超過"],
    ["dimensions", "寸法確認失敗"],
  ];
  return labels
    .flatMap(([reason, label]) => {
      const count = counts.get(reason);
      return count ? [`${label}${count}件`] : [];
    })
    .join("、");
}
