import type { Handler } from "hono";
import { html } from "hono/html";
import { parseBody } from "hono/utils/body";
import { MAX_SHARED_ATTACHMENT_BYTES } from "@/features/attachments/model/attachment-constants";
import {
  createShareIntake,
  getSharedFiles,
  ShareIntakeError,
} from "@/features/sharing/intake/share-intake";
import { normalizePendingShare } from "@/features/sharing/model/share";

const getString = (value: unknown) => (typeof value === "string" ? value : "");
const MAX_SHARED_REQUEST_BYTES = MAX_SHARED_ATTACHMENT_BYTES + 5 * 1024 * 1024;
export const MAX_ANONYMOUS_SHARE_BYTES = 64 * 1024;

export const parseBoundedBody = async (
  request: Request,
  maxBytes = MAX_SHARED_REQUEST_BYTES,
) => {
  const declaredLength = Number(request.headers.get("Content-Length"));
  if (Number.isSafeInteger(declaredLength) && declaredLength > maxBytes) {
    throw new ShareIntakeError(
      "共有ファイルの合計が75 MiBを超えています。",
      413,
    );
  }
  if (!request.body) return parseBody(request, { all: true });

  const reader = request.body.getReader();
  let receivedBytes = 0;
  const boundedBody = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const chunk = await reader.read();
      if (chunk.done) {
        controller.close();
        return;
      }
      receivedBytes += chunk.value.byteLength;
      if (receivedBytes > maxBytes) {
        await reader.cancel();
        controller.error(
          new ShareIntakeError(
            "共有ファイルの合計が75 MiBを超えています。",
            413,
          ),
        );
        return;
      }
      controller.enqueue(chunk.value);
    },
    async cancel(reason) {
      await reader.cancel(reason);
    },
  });

  const headers = new Headers();
  request.headers.forEach((value, key) => {
    headers.set(key, value);
  });
  const requestInit = {
    method: request.method,
    headers,
    body: boundedBody,
    duplex: "half",
  } as RequestInit & { duplex: "half" };
  return parseBody(new Request(request.url, requestInit), { all: true });
};

const shareError = (message: string) =>
  html`<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>共有エラー | My Memo</title></head><body><p role="alert">${message}</p><a href="/">ホームへ戻る</a></body></html>`;

export const receiveShare: Handler = async (c) => {
  const user = c.get("user");
  const maxBytes = user ? MAX_SHARED_REQUEST_BYTES : MAX_ANONYMOUS_SHARE_BYTES;
  const contentLength = Number(c.req.header("Content-Length"));
  if (Number.isSafeInteger(contentLength) && contentLength > maxBytes) {
    if (!user) return c.redirect("/login?callbackURL=%2Fshare%2Fconsume");
    return c.html(shareError("共有ファイルの合計が75 MiBを超えています。"));
  }

  let body: Record<string, string | File | (string | File)[]>;
  try {
    body = await parseBoundedBody(c.req.raw, maxBytes);
  } catch (error) {
    if (error instanceof ShareIntakeError) {
      if (!user) return c.redirect("/login?callbackURL=%2Fshare%2Fconsume");
      return c.html(shareError(error.message));
    }
    throw error;
  }
  const pendingShare = normalizePendingShare({
    title: getString(body.title),
    text: getString(body.text),
    url: getString(body.url),
  });
  const files = getSharedFiles(body.files);

  if (files.length > 0) {
    if (!user) return c.redirect("/login?callbackURL=%2F");

    try {
      const intake = await createShareIntake(
        c.env,
        user.id,
        pendingShare,
        files,
      );
      return c.redirect(
        `/memos/create?shared=1&shareId=${encodeURIComponent(intake.id)}`,
        303,
      );
    } catch (error) {
      const message =
        error instanceof ShareIntakeError
          ? error.message
          : "共有ファイルを受け取れませんでした。";
      return c.html(shareError(message));
    }
  }

  return c.html(
    html`<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>共有内容を受信 | My Memo</title><script src="/share-receiver.js" defer></script></head><body><p id="share-status" role="status">共有内容を受信しています。</p><div id="pending-share" hidden data-share="${JSON.stringify(pendingShare)}"></div></body></html>`,
  );
};
