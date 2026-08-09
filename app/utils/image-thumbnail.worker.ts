const MAX_THUMBNAIL_DIMENSION = 1280;
const THUMBNAIL_QUALITY = 0.8;

type ThumbnailRequest = { id: string; file: File };
type ThumbnailSuccess = {
  id: string;
  ok: true;
  blob: Blob;
  width: number;
  height: number;
};
type ThumbnailFailure = { id: string; ok: false; message: string };

self.addEventListener(
  "message",
  async (event: MessageEvent<ThumbnailRequest>) => {
    const { id, file } = event.data;
    let bitmap: ImageBitmap | undefined;
    try {
      bitmap = await createImageBitmap(file, {
        imageOrientation: "from-image",
      });
      const scale = Math.min(
        1,
        MAX_THUMBNAIL_DIMENSION / Math.max(bitmap.width, bitmap.height),
      );
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = new OffscreenCanvas(width, height);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("画像を変換できませんでした。");
      context.drawImage(bitmap, 0, 0, width, height);

      let blob = await canvas.convertToBlob({
        type: "image/avif",
        quality: THUMBNAIL_QUALITY,
      });
      if (blob.type !== "image/avif") {
        blob = await canvas.convertToBlob({
          type: "image/webp",
          quality: THUMBNAIL_QUALITY,
        });
      }
      if (blob.type !== "image/avif" && blob.type !== "image/webp") {
        throw new Error("AVIFまたはWebPのサムネイルを生成できませんでした。");
      }
      const result: ThumbnailSuccess = { id, ok: true, blob, width, height };
      self.postMessage(result);
    } catch (error) {
      const result: ThumbnailFailure = {
        id,
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "画像を変換できませんでした。",
      };
      self.postMessage(result);
    } finally {
      bitmap?.close();
    }
  },
);
