import {
  type HandlerInterceptor,
  unstable_getRequest,
  unstable_parseRouterRequest,
  unstable_setNonce,
} from "waku/router/server";
import { isPublicPath } from "@/security/public-paths";
import { getRequestContext, redirect } from "@/server/request-context";

const request: HandlerInterceptor = async (next) => {
  const c = getRequestContext();
  unstable_setNonce(c.get("nonce"));
  const route = unstable_parseRouterRequest(unstable_getRequest());
  const user = c.get("user");
  if (route?.type === "route") {
    if (!user && !isPublicPath(route.path)) redirect("/login");
    if (user) {
      if (route.path === "/login") redirect("/");
      if (route.path !== "/settings/account") {
        const deletion = await c.env.MY_MEMO_D1.prepare(
          "SELECT 1 FROM account_deletion_requests WHERE user_id = ?",
        )
          .bind(user.id)
          .first();
        if (deletion) redirect("/settings/account");
      }
    }
  }
  return next();
};
export default request;
