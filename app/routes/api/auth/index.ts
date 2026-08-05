import { Hono } from "hono";
import { getAuth } from "@/auth";

const authRoute = new Hono<{ Bindings: Cloudflare.Env }>();

authRoute.on(["GET", "POST"], "/*", (c) => {
  const auth = getAuth(c.env);

  return auth.handler(c.req.raw);
});

export default authRoute;
