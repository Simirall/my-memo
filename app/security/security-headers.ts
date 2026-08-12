import type { MiddlewareHandler } from "hono";

export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'report-sample'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' https:",
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
};
