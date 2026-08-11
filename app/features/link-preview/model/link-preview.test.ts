import { describe, expect, it } from "vitest";
import {
  getLinkPreviewRetryDelayMs,
  normalizeLinkPreviewUrl,
  parseLinkPreviewMetadata,
} from "./link-preview";

describe("リンクプレビューのURL", () => {
  it("ホストと既定ポートを正規化しフラグメントだけを除く", () => {
    expect(
      normalizeLinkPreviewUrl("HTTPS://EXAMPLE.COM:443/articles?id=1#comments"),
    ).toBe("https://example.com/articles?id=1");
  });

  it.each([
    "http://localhost/page",
    "http://127.0.0.1/page",
    "http://10.0.0.1/page",
    "http://169.254.169.254/latest/meta-data",
    "http://[::1]/page",
    "http://[::ffff:127.0.0.1]/page",
    "http://[::ffff:169.254.169.254]/latest/meta-data",
    "ftp://example.com/file",
  ])("公開HTTP URL以外を拒否する: %s", (url) => {
    expect(normalizeLinkPreviewUrl(url)).toBeNull();
  });
});

describe("リンクプレビューのメタデータ", () => {
  it("OGPをTwitter指定より優先し相対画像URLと文字参照を解決する", () => {
    const metadata = parseLinkPreviewMetadata(
      `<meta name="twitter:title" content="Twitter title">
       <meta property="og:title" content="記事 &amp; 詳細">
       <meta content="説明 &#x1f4dd;" property="og:description">
       <meta property="og:image" content="../images/card.jpg">
       <meta name="twitter:card" content="summary_large_image">`,
      "https://example.com/articles/1",
    );

    expect(metadata).toEqual({
      title: "記事 & 詳細",
      description: "説明 📝",
      imageUrl: "https://example.com/images/card.jpg",
      cardType: "summary_large_image",
    });
  });

  it("OGP欠落時はTwitterメタデータへフォールバックする", () => {
    expect(
      parseLinkPreviewMetadata(
        `<meta name="twitter:title" content="Twitter title">
         <meta name="twitter:description" content="Twitter description">
         <meta name="twitter:card" content="summary">`,
        "https://example.com/",
      ),
    ).toEqual({
      title: "Twitter title",
      description: "Twitter description",
      imageUrl: null,
      cardType: "summary",
    });
  });

  it("公開URLでない画像をブラウザへ渡さない", () => {
    expect(
      parseLinkPreviewMetadata(
        `<meta property="og:title" content="記事">
         <meta property="og:image" content="http://127.0.0.1/internal.png">`,
        "https://example.com/",
      )?.imageUrl,
    ).toBeNull();
  });
});

describe("リンクプレビューの失敗バックオフ", () => {
  it("1時間から倍増し最大7日で止める", () => {
    expect(getLinkPreviewRetryDelayMs(1)).toBe(60 * 60 * 1000);
    expect(getLinkPreviewRetryDelayMs(2)).toBe(2 * 60 * 60 * 1000);
    expect(getLinkPreviewRetryDelayMs(100)).toBe(7 * 24 * 60 * 60 * 1000);
  });
});
