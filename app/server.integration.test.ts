import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { htmlSecurityHeaders } from "./utils/security-headers";

const app = new Hono();
app.use("*", htmlSecurityHeaders);
app.get("/html", (c) => c.html("<p>本文</p>"));
app.get("/json", (c) => c.json({ ok: true }));

describe("HTMLレスポンスのセキュリティヘッダー", () => {
  it("CSPをReport-Onlyで通知しMIME sniffingを無効にする", async () => {
    const response = await app.request("https://example.com/html");

    expect(response.status).toBe(200);
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    const csp = response.headers.get("Content-Security-Policy-Report-Only");
    expect(csp).toContain("script-src 'self' 'report-sample'");
    expect(csp).toContain("img-src 'self' https:");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("form-action 'self'");
    expect(response.headers.get("Content-Security-Policy")).toBeNull();
  });

  it("JSONレスポンスにはHTML用CSPを付けない", async () => {
    const response = await app.request("https://example.com/json");

    expect(
      response.headers.get("Content-Security-Policy-Report-Only"),
    ).toBeNull();
  });
});
