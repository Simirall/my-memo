import type { ErrorHandler } from "hono";

const handler: ErrorHandler = (e, c) => {
  if ("getResponse" in e) {
    return e.getResponse();
  }
  console.error(
    JSON.stringify({ event: "unhandled_request_error", errorType: e.name }),
  );
  c.status(500);

  return c.render(
    <div className="space-y-4 p-4 text-center">
      <h1 className="font-bold text-4xl">エラーが発生しました</h1>
      <p className="text-base-content/70">
        時間をおいて、もう一度お試しください。
      </p>
      <a className="btn" href="/">
        メモ一覧へ戻る
      </a>
    </div>,
  );
};

export default handler;
