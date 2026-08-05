/**
 * 最低限のHTMLサニタイズユーティリティ
 * Cloudflare Workers環境で動作するシンプルな実装
 *
 * 注意: 完全なXSS対策ではありません。
 * 信頼できるソース（自身のメモ）に対してのみ使用してください。
 */

// 許可するHTMLタグ（Markdown出力で使用される一般的なタグ）
const ALLOWED_TAGS = new Set([
  "p",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "del",
  "ins",
  "mark",
  "code",
  "pre",
  "blockquote",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "ul",
  "ol",
  "li",
  "a",
  "img",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
  "hr",
  "div",
  "span",
  "sup",
  "sub",
]);

// 許可する属性（タグごと）
const ALLOWED_ATTRIBUTES: Record<string, Set<string>> = {
  a: new Set(["href", "title", "target", "rel"]),
  img: new Set(["src", "alt", "title", "width", "height"]),
  td: new Set(["colspan", "rowspan"]),
  th: new Set(["colspan", "rowspan"]),
  code: new Set(["class"]), // シンタックスハイライト用
  pre: new Set(["class"]),
  span: new Set(["class"]),
  div: new Set(["class"]),
};

// 危険なURLスキーム
const DANGEROUS_URL_SCHEMES = /^(?:javascript:|vbscript:|data:(?!image\/))/i;

// 安全なURLかチェック
function isSafeUrl(url: string): boolean {
  const trimmed = url.trim().toLowerCase();
  return !DANGEROUS_URL_SCHEMES.test(trimmed);
}

// 属性値をエスケープ
function escapeAttributeValue(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * HTMLをサニタイズする
 * @param html サニタイズ対象のHTML文字列
 * @returns サニタイズされたHTML文字列
 */
export function sanitizeHtml(html: string): string {
  // scriptタグを完全に除去
  let sanitized = html.replace(
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    "",
  );

  // styleタグを完全に除去
  sanitized = sanitized.replace(
    /<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi,
    "",
  );

  // イベントハンドラ属性を除去 (onclick, onerror, onload など)
  sanitized = sanitized.replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, "");
  sanitized = sanitized.replace(/\s+on\w+\s*=\s*[^\s>"']+/gi, "");

  // 許可されていないタグを除去（開始タグと終了タグ両方）
  sanitized = sanitized.replace(
    /<\/?([a-z][a-z0-9]*)\b(?:[^"'/>]|"[^"]*"|'[^']*')*>/gi,
    (match, tagName) => {
      const lowerTagName = tagName.toLowerCase();

      if (!ALLOWED_TAGS.has(lowerTagName)) {
        return ""; // 許可されていないタグは除去
      }

      // 終了タグはそのまま返す
      if (match.startsWith("</")) {
        return `</${lowerTagName}>`;
      }

      // 開始タグの属性をフィルタリング
      const allowedAttrs = ALLOWED_ATTRIBUTES[lowerTagName];

      // 属性を抽出（エスケープされたクォートと自己終了スラッシュを考慮）
      const attrRegex =
        /([a-z][a-z0-9-]*)\s*=\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|([^\s/>]+))/gi;
      const attributes: string[] = [];

      for (const attrMatch of match.matchAll(attrRegex)) {
        const attrName = attrMatch[1].toLowerCase();
        const attrValue = attrMatch[2] ?? attrMatch[3] ?? attrMatch[4] ?? "";

        // 許可された属性のみ
        if (allowedAttrs?.has(attrName)) {
          // href, src属性は安全なURLかチェック
          if (
            (attrName === "href" || attrName === "src") &&
            !isSafeUrl(attrValue)
          ) {
            continue; // 危険なURLは除去
          }

          attributes.push(`${attrName}="${escapeAttributeValue(attrValue)}"`);
        }
      }

      // aタグには自動でrel="noopener noreferrer"を追加
      if (
        lowerTagName === "a" &&
        !attributes.some((a) => a.startsWith("rel="))
      ) {
        attributes.push('rel="noopener noreferrer"');
      }

      // 自己終了タグの処理
      const selfClosing =
        match.endsWith("/>") || ["br", "hr", "img"].includes(lowerTagName);
      const attrString =
        attributes.length > 0 ? ` ${attributes.join(" ")}` : "";

      return selfClosing
        ? `<${lowerTagName}${attrString} />`
        : `<${lowerTagName}${attrString}>`;
    },
  );

  return sanitized;
}
