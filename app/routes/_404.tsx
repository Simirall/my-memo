import type { NotFoundHandler } from "hono";

const handler: NotFoundHandler = (c) => {
  c.status(404);
  return c.render(
    <div className="p-4 text-center text-4xl">404 Not Found</div>,
  );
};

export default handler;
