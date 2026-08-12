import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import renderer, { JAVASCRIPT_REQUIRED_MESSAGE } from "./_renderer";

describe("JavaScript必須の共通レンダラー", () => {
  it("SSRで通常アプリを識別ラッパーに入れ、noscript時だけ全画面案内を表示する", async () => {
    const app = new Hono();
    app.use("*", async (c, next) => {
      c.set("user", null);
      c.set("session", null);
      await next();
    });
    app.use("*", renderer);
    app.get("/", (c) => c.render(<p>通常のアプリ</p>));

    const response = await app.request("https://example.test/");
    const html = await response.text();

    expect(html).toContain(JAVASCRIPT_REQUIRED_MESSAGE);
    const styleIndex = html.indexOf(
      "<style>#app-with-javascript { display: none !important; }</style>",
    );
    const headCloseIndex = html.indexOf("</head>");
    const bodyIndex = html.indexOf("<body>");
    expect(styleIndex).toBeGreaterThan(-1);
    expect(styleIndex).toBeLessThan(headCloseIndex);
    expect(html.indexOf("<noscript><main", bodyIndex)).toBeGreaterThan(
      bodyIndex,
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain('<div id="app-with-javascript">');
    expect(html).toContain("通常のアプリ");
  });

  it("保存済みテーマをスタイルシートより前に同期復元する", async () => {
    const app = new Hono();
    app.use("*", async (c, next) => {
      c.set("user", null);
      c.set("session", null);
      await next();
    });
    app.use("*", renderer);
    app.get("/", (c) => c.render(<p>通常のアプリ</p>));

    const response = await app.request("https://example.test/");
    const html = await response.text();
    const script = '<script src="/theme-init.js"></script>';

    expect(html).toContain('<meta content="light dark" name="color-scheme"/>');
    expect(html).toContain(script);
    expect(html.indexOf(script)).toBeLessThan(
      html.indexOf('href="/app/style.css"'),
    );
  });

  it("設定ページではヘッダーに設定メニューを開くボタンを表示する", async () => {
    const app = new Hono();
    app.use("*", async (c, next) => {
      c.set("user", null);
      c.set("session", null);
      await next();
    });
    app.use("*", renderer);
    app.get("/settings/account", (c) => c.render(<p>アカウント設定</p>));

    const response = await app.request("https://example.test/settings/account");
    const html = await response.text();

    expect(html).toContain('aria-label="設定メニューを開く"');
    expect(html).toContain('for="settings-drawer"');
  });
});
