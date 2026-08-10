import { describe, expect, it } from "vitest";
import { decodeHtmlWithCorrectEncoding } from "./decode-html-with-correct-encoding";

const response = (body: BodyInit, contentType?: string) =>
  new Response(body, {
    headers: contentType ? { "content-type": contentType } : undefined,
  });

describe("HTML文字コードの判定", () => {
  it("HTTPヘッダーのcharsetをmeta指定より優先する", async () => {
    const html = '<meta charset="shift_jis"><p>UTF-8本文</p>';

    await expect(
      decodeHtmlWithCorrectEncoding(response(html, "text/html; charset=utf-8")),
    ).resolves.toBe(html);
  });

  it("meta charsetのShift_JIS別名を正規化して日本語を復元する", async () => {
    const prefix = new TextEncoder().encode('<meta charset="sjis"><p>');
    const suffix = new TextEncoder().encode("</p>");
    const bytes = new Uint8Array(prefix.length + 4 + suffix.length);
    bytes.set(prefix);
    // 「日本」のShift_JIS表現。別名の正規化と実デコードを同時に保証する。
    bytes.set([0x93, 0xfa, 0x96, 0x7b], prefix.length);
    bytes.set(suffix, prefix.length + 4);

    await expect(
      decodeHtmlWithCorrectEncoding(response(bytes)),
    ).resolves.toContain("<p>日本</p>");
  });

  it("http-equiv形式のmeta charsetを読み取る", async () => {
    const html =
      '<meta http-equiv="Content-Type" content="text/html; charset=utf-8"><p>本文</p>';

    await expect(decodeHtmlWithCorrectEncoding(response(html))).resolves.toBe(
      html,
    );
  });

  it("未知のcharsetはUTF-8へフォールバックする", async () => {
    const html = "<p>フォールバック</p>";

    await expect(
      decodeHtmlWithCorrectEncoding(
        response(html, "text/html; charset=unknown-encoding"),
      ),
    ).resolves.toBe(html);
  });
});
