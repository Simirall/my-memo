import { tryGetContext } from "hono/context-storage";
import {
  getRequest,
  type HandlerInterceptor,
  requestRedirect,
  unstable_parseRouterRequest,
  unstable_setNonce,
} from "waku/router/server";
import {
  getAppDb,
  getFreshUser,
} from "@/features/access-control/authorization";
import { isPublicPath } from "@/security/public-paths";

const request: HandlerInterceptor = async (next) => {
  const c = tryGetContext<{ Bindings: CloudflareBindings }>();
  // Wakuのビルド用リクエストはHonoミドルウェアを通らない。
  if (!c) return next();
  unstable_setNonce(c.get("nonce"));
  const route = unstable_parseRouterRequest(getRequest());
  const user = c.get("user");
  if (route?.type === "route") {
    if (!user && !isPublicPath(route.path)) requestRedirect("/login");
    if (user) {
      if (route.path === "/login") {
        requestRedirect("/");
        return next();
      }
      if (route.path !== "/settings/account") {
        const deletion = await c.env.MY_MEMO_D1.prepare(
          "SELECT 1 FROM account_deletion_requests WHERE user_id = ?",
        )
          .bind(user.id)
          .first();
        if (deletion) {
          requestRedirect("/settings/account");
          return next();
        }
      }
      if (route.path === "/admin/users") {
        const actor = await getFreshUser(getAppDb(c.env), user.id);
        if (actor?.role !== "admin") {
          throw new Response("このページを表示する権限がありません。", {
            status: 403,
          });
        }
        c.set("canViewAdminUsers", true);
      }
    }
  }
  return next();
};
export default request;
