import { showRoutes } from "hono/dev";
import { appendTrailingSlash } from "hono/trailing-slash";
import { createHono } from "honox/factory";
import { createApp } from "honox/server";
import { auth } from "./auth";

const baseApp = createHono();

// リクエストの末尾に/を追加するミドルウェア
baseApp.use(appendTrailingSlash());

// セッション情報を取得してコンテキストにセットするミドルウェア
baseApp.use("*", async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });

  if (!session) {
    c.set("user", null);
    c.set("session", null);
    await next();
    return;
  }

  c.set("user", session.user);
  c.set("session", session.session);

  await next();
});

// 未認証の場合はリダイレクトするミドルウェア
baseApp.use("*", async (c, next) => {
  const user = c.get("user");

  const publicPaths = [
    "/login",
    "/login/callback",
    "/favicon.ico",
    "/robots.txt",
    "/.well-known",
  ];
  const isPublic = publicPaths.some((p) => c.req.path === p);

  if (isPublic || user) {
    await next();
    return;
  } else {
    return c.redirect("/login");
  }
});

const app = createApp({ app: baseApp });

showRoutes(app);

export default app;
