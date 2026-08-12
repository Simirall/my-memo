import { showRoutes } from "hono/dev";
import { trimTrailingSlash } from "hono/trailing-slash";
import { createHono } from "honox/factory";
import { createApp } from "honox/server";
import { cleanupExpiredUploads } from "@/features/attachments/server/expired-upload-cleanup";
import { processR2DeletionJobs } from "@/features/attachments/server/r2-deletion-jobs";
import {
  htmlSecurityHeaders,
  sameOriginMutationProtection,
} from "@/security/security-headers";
import { getAuth } from "./auth";

const baseApp = createHono();

// URLは末尾スラッシュなしに統一する
baseApp.use(trimTrailingSlash());
baseApp.use("*", sameOriginMutationProtection);

// HTMLレスポンスへCSPと認証済みページのcache制御を適用する
baseApp.use("*", htmlSecurityHeaders);

// セッション情報を取得してコンテキストにセットするミドルウェア
baseApp.use("*", async (c, next) => {
  const auth = getAuth(c.env);
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
    "/api/auth",
    "/manifest.webmanifest",
    "/robots.txt",
    "/service-worker.js",
    "/share",
    "/.well-known",
  ];
  const isPublic = publicPaths.some(
    (p) => c.req.path === p || c.req.path.startsWith(p),
  );

  if (isPublic || user) {
    await next();
    return;
  } else {
    return c.redirect("/login");
  }
});

// ログイン済みの場合はログインページにアクセスできないようにするミドルウェア
baseApp.use("/login", async (c, next) => {
  const user = c.get("user");

  if (user) {
    return c.redirect("/");
  }

  await next();
});

const app = createApp({ app: baseApp });

if (import.meta.env.DEV) showRoutes(app);

export default {
  fetch: app.fetch.bind(app),
  scheduled(
    _controller: ScheduledController,
    env: CloudflareBindings,
    ctx: ExecutionContext,
  ) {
    ctx.waitUntil(
      Promise.all([cleanupExpiredUploads(env), processR2DeletionJobs(env)]),
    );
  },
};
