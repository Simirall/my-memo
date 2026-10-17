import { Hono } from "hono";
import { contextStorage } from "hono/context-storage";
import { trimTrailingSlash } from "hono/trailing-slash";
import { finalizeAccountDeletions } from "@/features/account-deletion/server/account-deletion";
import { cleanupExpiredUploads } from "@/features/attachments/server/expired-upload-cleanup";
import { processR2DeletionJobs } from "@/features/attachments/server/r2-deletion-jobs";
import { isPublicPath } from "@/security/public-paths";
import {
  htmlSecurityHeaders,
  sameOriginMutationProtection,
} from "@/security/security-headers";
import { getAuth } from "./auth";
import apiAccountDeletion from "./routes/api/account-deletion/index";
import apiAdminUsers from "./routes/api/admin/users/index";
import apiAttachments from "./routes/api/attachments/index";
import apiAuth from "./routes/api/auth/index";
import apiCategories from "./routes/api/categories/index";
import apiMemos from "./routes/api/memos/index";
import apiShareIntakes from "./routes/api/share-intakes/index";
import apiTags from "./routes/api/tags/index";
import { receiveShare } from "./routes/share/receive";

export const app = new Hono<{ Bindings: CloudflareBindings }>();
app.use(contextStorage());

// URLは末尾スラッシュなしに統一する
app.use(trimTrailingSlash());
app.use("*", sameOriginMutationProtection);

// HTMLレスポンスへCSPと認証済みページのcache制御を適用する
app.use("*", htmlSecurityHeaders);

// セッション情報を取得してコンテキストにセットするミドルウェア
app.use("*", async (c, next) => {
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

app.use("/api/*", async (c, next) => {
  const user = c.get("user");
  if (!user && !isPublicPath(c.req.path)) return c.redirect("/login");
  if (
    user &&
    !c.req.path.startsWith("/api/account-deletion") &&
    !c.req.path.startsWith("/api/auth")
  ) {
    const deletion = await c.env.MY_MEMO_D1.prepare(
      "SELECT 1 FROM account_deletion_requests WHERE user_id = ?",
    )
      .bind(user.id)
      .first();
    if (deletion) return c.redirect("/settings/account");
  }
  return next();
});
app.post(
  "/share",
  async (c, next) => {
    const user = c.get("user");
    if (user) {
      const deletion = await c.env.MY_MEMO_D1.prepare(
        "SELECT 1 FROM account_deletion_requests WHERE user_id = ?",
      )
        .bind(user.id)
        .first();
      if (deletion) return c.redirect("/settings/account");
    }
    return next();
  },
  receiveShare,
);
app.route("/api/account-deletion", apiAccountDeletion);
app.route("/api/attachments", apiAttachments);
app.route("/api/auth", apiAuth);
app.route("/api/categories", apiCategories);
app.route("/api/memos", apiMemos);
app.route("/api/share-intakes", apiShareIntakes);
app.route("/api/tags", apiTags);
app.route("/api/admin/users", apiAdminUsers);

export function scheduled(
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
}
