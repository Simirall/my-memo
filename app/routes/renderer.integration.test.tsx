import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Header } from "@/components/header";
import Root, { JAVASCRIPT_REQUIRED_MESSAGE } from "@/pages/_root";

vi.mock("@/components/app-link", () => ({
  AppLink: ({
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a {...props}>{children}</a>
  ),
}));

describe("JavaScript必須の共通レンダラー", () => {
  it("SSRで通常アプリを識別ラッパーに入れ、noscript時だけ全画面案内を表示する", async () => {
    const html = renderToStaticMarkup(
      <Root>
        <p>通常のアプリ</p>
      </Root>,
    );

    expect(html).toContain(JAVASCRIPT_REQUIRED_MESSAGE);
    const styleIndex = html.indexOf(
      "#app-with-javascript { display: none !important; }",
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
    const html = renderToStaticMarkup(
      <Root>
        <p>通常のアプリ</p>
      </Root>,
    );
    const script = '<script src="/theme-init.js"></script>';

    expect(html).toContain('<meta content="light dark" name="color-scheme"/>');
    expect(html).toContain('<meta content="#20252e" name="theme-color"/>');
    expect(html).toContain(
      '<link href="/icon.svg" rel="icon" type="image/svg+xml"/>',
    );
    expect(html).not.toContain("favicon.ico");
    expect(html).toContain(script);
    expect(html).toContain('src="/pwa-init.js"');
  });

  it("設定ページで設定メニューを開く操作を提供する", () => {
    const html = renderToStaticMarkup(
      <Header path="/settings/account" user={null} />,
    );
    expect(html).toContain('aria-label="設定メニューを開く"');
    expect(html).toContain('for="settings-drawer"');
  });
});
