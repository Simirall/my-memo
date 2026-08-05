import { createRoute } from "honox/factory";
import { normalizePendingShare } from "@/routes/-features/sharing";
import ShareReceiver from "./-components/$share-receiver";

const getString = (value: unknown) => (typeof value === "string" ? value : "");

export const POST = createRoute(async (c) => {
  const body = await c.req.parseBody();
  const pendingShare = normalizePendingShare({
    title: getString(body.title),
    text: getString(body.text),
    url: getString(body.url),
  });

  return c.render(
    <div className="w-full [&>honox-island]:block [&>honox-island]:w-full">
      <ShareReceiver share={pendingShare} />
    </div>,
  );
});

export default createRoute((c) =>
  c.render(
    <div className="flex min-h-[50svh] items-center justify-center p-8">
      <div className="alert alert-info max-w-md" role="status">
        このページは、端末の共有メニューからコンテンツを受け取るために使用します。
      </div>
    </div>,
  ),
);
