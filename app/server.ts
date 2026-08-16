import { showRoutes } from "hono/dev";
import { trimTrailingSlash } from "hono/trailing-slash";
import { createHono } from "honox/factory";
import { createApp } from "honox/server";
import { finalizeAccountDeletions } from "@/features/account-deletion/server/account-deletion";
import { cleanupExpiredUploads } from "@/features/attachments/server/expired-upload-cleanup";
import { processR2DeletionJobs } from "@/features/attachments/server/r2-deletion-jobs";
import { isPublicPath } from "@/security/public-paths";
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
  const { headers, response: session } = await auth.api.getSession({
    headers: c.req.raw.headers,
    returnHeaders: true,
  });

  if (!session) {
    c.set("user", null);
    c.set("session", null);
  } else {
    c.set("user", session.user);
    c.set("session", session.session);
  }

  await next();
  for (const cookie of headers.getSetCookie()) {
    c.header("Set-Cookie", cookie, { append: true });
  }
});

baseApp.use("*", async (c, next) => {
  const user = c.get("user");
  if (!user) return next();
  if (
    c.req.path === "/settings/account" ||
    c.req.path.startsWith("/api/account-deletion") ||
    c.req.path.startsWith("/api/auth")
  ) {
    return next();
  }
  const deletion = await c.env.MY_MEMO_D1.prepare(
    "SELECT 1 FROM account_deletion_requests WHERE user_id = ?",
  )
    .bind(user.id)
    .first();
  if (deletion) return c.redirect("/settings/account");
  return next();
});

// 未認証の場合はリダイレクトするミドルウェア
baseApp.use("*", async (c, next) => {
  const user = c.get("user");

  if (isPublicPath(c.req.path) || user) {
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
      Promise.all([
        cleanupExpiredUploads(env),
        (async () => {
          await processR2DeletionJobs(env);
          await finalizeAccountDeletions(env);
        })(),
      ]),
    );
  },
};
