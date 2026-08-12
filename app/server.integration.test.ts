import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import {
  htmlSecurityHeaders,
  sameOriginMutationProtection,
} from "@/security/security-headers";

const app = new Hono();
app.use("*", htmlSecurityHeaders);
app.use("*", async (c, next) => {
  c.set("user", c.req.path === "/authenticated" ? ({} as never) : null);
  c.set("session", null);
  await next();
});
app.get("/html", (c) => c.html("<p>本文</p>"));
app.get("/authenticated", (c) => c.html("<p>認証済み</p>"));
app.get("/json", (c) => c.json({ ok: true }));

describe("HTMLレスポンスのセキュリティヘッダー", () => {
  it("CSPを強制しMIME sniffingを無効にする", async () => {
    const response = await app.request("https://example.com/html");

    expect(response.status).toBe(200);
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    const csp = response.headers.get("Content-Security-Policy");
    expect(csp).toContain("script-src 'self' 'report-sample'");
    expect(csp).toContain("img-src 'self' https: data:");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("form-action 'self'");
    expect(
      response.headers.get("Content-Security-Policy-Report-Only"),
    ).toBeNull();
  });

  it("JSONレスポンスにはHTML用CSPを付けない", async () => {
    const response = await app.request("https://example.com/json");

    expect(response.headers.get("Content-Security-Policy")).toBeNull();
  });

  it("認証済みHTMLをブラウザへ保存させない", async () => {
    const response = await app.request("https://example.com/authenticated");

    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });
});

const mutationApp = new Hono();
mutationApp.use("*", sameOriginMutationProtection);
mutationApp.post("/api/memos", (c) => c.json({ ok: true }));
mutationApp.post("/settings", (c) => c.text("ok"));
mutationApp.post("/api/auth/callback", (c) => c.text("auth"));
mutationApp.post("/api/authentication", (c) => c.text("not auth"));
mutationApp.post("/share", (c) => c.text("share"));

describe("状態変更リクエストのOrigin検査", () => {
  it("同一Originの状態変更を許可する", async () => {
    const response = await mutationApp.request(
      "https://example.com/api/memos",
      {
        method: "POST",
        headers: { Origin: "https://example.com" },
      },
    );

    expect(response.status).toBe(200);
  });

  it.each([undefined, "https://attacker.example"])(
    "Originが%sの場合はAPIをJSONで拒否する",
    async (origin) => {
      const headers = origin ? { Origin: origin } : undefined;
      const response = await mutationApp.request(
        "https://example.com/api/memos",
        { method: "POST", headers },
      );

      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({ code: "INVALID_ORIGIN" });
    },
  );

  it("通常フォームはテキストの403を返す", async () => {
    const response = await mutationApp.request("https://example.com/settings", {
      method: "POST",
    });

    expect(response.status).toBe(403);
    expect(response.headers.get("Content-Type")).toContain("text/plain");
  });

  it.each(["/api/auth/callback", "/share"])(
    "外部入口%sは共通Origin検査から除外する",
    async (path) => {
      const response = await mutationApp.request(`https://example.com${path}`, {
        method: "POST",
      });

      expect(response.status).toBe(200);
    },
  );

  it("認証ルートに似ただけのAPIは例外にしない", async () => {
    const response = await mutationApp.request(
      "https://example.com/api/authentication",
      { method: "POST" },
    );

    expect(response.status).toBe(403);
  });
});
