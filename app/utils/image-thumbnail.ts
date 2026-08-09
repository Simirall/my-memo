export type GeneratedThumbnail = {
  blob: Blob;
  width: number;
  height: number;
};

type ThumbnailWorkerResponse =
  | ({ id: string; ok: true } & GeneratedThumbnail)
  | { id: string; ok: false; message: string };

let worker: Worker | undefined;
const pending = new Map<
  string,
  {
    resolve: (value: GeneratedThumbnail) => void;
    reject: (reason: Error) => void;
  }
>();

const getWorker = () => {
  if (worker) return worker;
  worker = new Worker(new URL("./image-thumbnail.worker.ts", import.meta.url), {
    type: "module",
  });
  worker.addEventListener(
    "message",
    (event: MessageEvent<ThumbnailWorkerResponse>) => {
      const request = pending.get(event.data.id);
      if (!request) return;
      pending.delete(event.data.id);
      if (event.data.ok) {
        request.resolve({
          blob: event.data.blob,
          width: event.data.width,
          height: event.data.height,
        });
      } else {
        request.reject(new Error(event.data.message));
      }
    },
  );
  worker.addEventListener("error", () => {
    for (const request of pending.values()) {
      request.reject(new Error("画像変換Workerでエラーが発生しました。"));
    }
    pending.clear();
    worker?.terminate();
    worker = undefined;
  });
  return worker;
};

export const generateImageThumbnail = (
  file: File,
): Promise<GeneratedThumbnail> => {
  const id = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    getWorker().postMessage({ id, file });
  });
};
