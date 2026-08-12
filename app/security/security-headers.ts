import type { MiddlewareHandler } from "hono";

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'report-sample'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' https: data: blob:",
  "media-src 'self' blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
].join("; ");

export const htmlSecurityHeaders: MiddlewareHandler = async (c, next) => {
  await next();
  const contentType = c.res.headers.get("Content-Type") ?? "";
  if (!contentType.toLowerCase().startsWith("text/html")) return;

  c.header("X-Content-Type-Options", "nosniff");
  c.header("Content-Security-Policy", CONTENT_SECURITY_POLICY);
  if (c.get("user")) c.header("Cache-Control", "private, no-store");
};

export const sameOriginMutationProtection: MiddlewareHandler = async (
  c,
  next,
) => {
  if (!UNSAFE_METHODS.has(c.req.method)) return next();
  if (c.req.path === "/api/auth" || c.req.path.startsWith("/api/auth/")) {
    return next();
  }
  if (c.req.method === "POST" && c.req.path === "/share") return next();

  const origin = c.req.header("Origin");
  const expectedOrigin = new URL(c.req.url).origin;
  if (origin === expectedOrigin) return next();

  if (c.req.path.startsWith("/api/")) {
    return c.json(
      { code: "INVALID_ORIGIN", message: "リクエスト元を確認できません。" },
      403,
    );
  }
  return c.text("リクエスト元を確認できません。", 403);
};
