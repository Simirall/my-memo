import type { NotFoundHandler } from "hono";

const handler: NotFoundHandler = (c) => {
  c.status(404);
  return c.render(
    <div className="space-y-4 p-4 text-center">
      <title>ページが見つかりません | My Memo</title>
      <h1 className="font-bold text-4xl">ページが見つかりません</h1>
      <p className="text-base-content/70">URLが正しいか確認してください。</p>
      <a className="btn" href="/">
        メモ一覧へ戻る
      </a>
    </div>,
  );
};

export default handler;
