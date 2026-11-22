import { getContext } from "hono/context-storage";
import { unstable_cancelRender } from "waku/minimal/server";
import { requestNotFound, requestRedirect } from "waku/router/server";

export const notFound = () => {
  requestNotFound();
  return unstable_cancelRender();
};

export const redirect = (to: string) => {
  requestRedirect(to as Parameters<typeof requestRedirect>[0]);
  return unstable_cancelRender();
};

export const getRequestContext = () =>
  getContext<{ Bindings: CloudflareBindings }>();
