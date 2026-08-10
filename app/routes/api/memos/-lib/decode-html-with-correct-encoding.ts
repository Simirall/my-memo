/**
 * HTMLのバイナリデータから文字エンコーディングを検出し、UTF-8に変換する
 */
export const decodeHtmlWithCorrectEncoding = async (
  response: Response,
): Promise<string> => {
  const arrayBuffer = await response.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);

  // まずASCII部分だけを見てmetaタグからエンコーディングを検出
  const asciiPreview = new TextDecoder("ascii", { fatal: false }).decode(
    uint8Array.slice(0, 2048),
  );

  // Content-Typeヘッダーからcharsetを取得
  const contentType = response.headers.get("content-type") || "";
  const charsetMatch = contentType.match(/charset=([^\s;]+)/i);

  let encoding = charsetMatch?.[1]?.toLowerCase();

  // metaタグからcharsetを検出（Content-Typeで見つからない場合）
  if (!encoding) {
    // <meta charset="xxx">
    const metaCharsetMatch = asciiPreview.match(
      /<meta\s+charset=["']?([^"'\s>]+)/i,
    );
    if (metaCharsetMatch) {
      encoding = metaCharsetMatch[1].toLowerCase();
    }
  }

  if (!encoding) {
    // <meta http-equiv="Content-Type" content="text/html; charset=xxx">
    const metaContentTypeMatch = asciiPreview.match(
      /<meta[^>]+content=["'][^"']*charset=([^"'\s;]+)/i,
    );
    if (metaContentTypeMatch) {
      encoding = metaContentTypeMatch[1].toLowerCase();
    }
  }

  // Shift_JIS系のエンコーディング名を正規化
  if (
    encoding === "shift_jis" ||
    encoding === "x-sjis" ||
    encoding === "sjis"
  ) {
    encoding = "shift-jis";
  }

  // デフォルトはUTF-8
  if (!encoding) {
    encoding = "utf-8";
  }

  try {
    const decoder = new TextDecoder(encoding);
    return decoder.decode(uint8Array);
  } catch {
    // 未知のエンコーディングの場合はUTF-8でフォールバック
    return new TextDecoder("utf-8", { fatal: false }).decode(uint8Array);
  }
};
