import { parseBody } from "hono/utils/body";
import { createRoute } from "honox/factory";
import { MAX_SHARED_ATTACHMENT_BYTES } from "@/features/attachments/model/attachment-constants";
import {
  createShareIntake,
  getSharedFiles,
  ShareIntakeError,
} from "@/features/sharing/intake/share-intake";
import { normalizePendingShare } from "@/features/sharing/model/share";
import ShareReceiver from "./-components/$share-receiver";

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

export const POST = createRoute(async (c) => {
  const user = c.get("user");
  const maxBytes = user ? MAX_SHARED_REQUEST_BYTES : MAX_ANONYMOUS_SHARE_BYTES;
  const contentLength = Number(c.req.header("Content-Length"));
  if (Number.isSafeInteger(contentLength) && contentLength > maxBytes) {
    if (!user) return c.redirect("/login?callbackURL=%2Fshare%2Fconsume");
    return c.render(
      <ShareError message="共有ファイルの合計が75 MiBを超えています。" />,
    );
  }

  let body: Record<string, string | File | (string | File)[]>;
  try {
    body = await parseBoundedBody(c.req.raw, maxBytes);
  } catch (error) {
    if (error instanceof ShareIntakeError) {
      if (!user) return c.redirect("/login?callbackURL=%2Fshare%2Fconsume");
      return c.render(<ShareError message={error.message} />);
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
      return c.render(<ShareError message={message} />);
    }
  }

  return c.render(
    <div className="w-full [&>honox-island]:block [&>honox-island]:w-full">
      <title>共有内容を受信 | My Memo</title>
      <ShareReceiver share={pendingShare} />
    </div>,
  );
});

export default createRoute((c) =>
  c.render(
    <div className="flex min-h-[50svh] items-center justify-center p-8">
      <title>共有 | My Memo</title>
      <div className="alert alert-info max-w-md" role="status">
        このページは、端末の共有メニューからコンテンツを受け取るために使用します。
      </div>
    </div>,
  ),
);

const ShareError = ({ message }: { message: string }) => (
  <div className="flex min-h-[50svh] items-center justify-center p-8">
    <title>共有エラー | My Memo</title>
    <div className="card w-full max-w-[28rem] bg-base-100 shadow-sm">
      <div className="card-body gap-4 text-center">
        <div aria-live="polite" className="alert alert-error" role="alert">
          {message}
        </div>
        <a className="btn" href="/">
          ホームへ戻る
        </a>
      </div>
    </div>
  </div>
);
