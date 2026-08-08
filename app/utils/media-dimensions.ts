import {
  type AttachmentPreviewKind,
  areValidMediaDimensions,
  type MediaDimensions,
} from "./attachment-constants";

const readDimensionsFromElement = (
  source: string,
  kind: "image" | "video",
): Promise<MediaDimensions> =>
  kind === "image"
    ? new Promise((resolve, reject) => {
        const element = new Image();
        element.onload = () => {
          const dimensions = {
            width: element.naturalWidth,
            height: element.naturalHeight,
          };
          element.onload = null;
          element.onerror = null;
          element.removeAttribute("src");
          if (!areValidMediaDimensions(dimensions)) {
            reject(new Error("画像・動画の寸法が不正です。"));
            return;
          }
          resolve(dimensions);
        };
        element.onerror = () => {
          element.onload = null;
          element.onerror = null;
          element.removeAttribute("src");
          reject(new Error("画像・動画の寸法を取得できませんでした。"));
        };
        element.src = source;
      })
    : new Promise((resolve, reject) => {
        const element = document.createElement("video");
        const cleanup = () => {
          element.onloadedmetadata = null;
          element.onerror = null;
          element.removeAttribute("src");
          element.load();
        };
        element.onloadedmetadata = () => {
          const dimensions = {
            width: element.videoWidth,
            height: element.videoHeight,
          };
          cleanup();
          if (!areValidMediaDimensions(dimensions)) {
            reject(new Error("画像・動画の寸法が不正です。"));
            return;
          }
          resolve(dimensions);
        };
        element.onerror = () => {
          cleanup();
          reject(new Error("画像・動画の寸法を取得できませんでした。"));
        };
        element.preload = "metadata";
        element.src = source;
      });

export const readMediaDimensionsFromUrl = (
  source: string,
  kind: "image" | "video",
) => readDimensionsFromElement(source, kind);

export async function readMediaDimensions(
  file: File,
  kind: AttachmentPreviewKind | null,
): Promise<MediaDimensions | null> {
  if (kind !== "image" && kind !== "video") return null;
  const source = URL.createObjectURL(file);
  try {
    return await readDimensionsFromElement(source, kind);
  } finally {
    URL.revokeObjectURL(source);
  }
}
