import { Hono } from "hono";

export const authRoute = new Hono();

authRoute.on(["GET", "POST"], "/auth/*", (c) => {
  return c.text("aaa");
});
