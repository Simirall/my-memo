import { getContext } from "hono/context-storage";
import { unstable_createCustomError } from "waku/minimal/server";

import { unstable_notFound, unstable_redirect } from "waku/router/server";

export const notFound = () => unstable_notFound();
export const redirect = (to: string) =>
  unstable_redirect(to as Parameters<typeof unstable_redirect>[0]);

export const getRequestContext = () =>
  getContext<{ Bindings: CloudflareBindings }>();

export const forbidden = (): never => {
  throw unstable_createCustomError("このページを表示する権限がありません。", {
    status: 403,
  });
};
