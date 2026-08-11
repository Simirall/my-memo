export const decodeLinkPreviewHtml = (bytes: Uint8Array, headers: Headers) => {
  const asciiPreview = new TextDecoder("ascii", { fatal: false }).decode(
    bytes.slice(0, 2048),
  );
  const contentType = headers.get("content-type") ?? "";
  let encoding = contentType.match(/charset=([^\s;]+)/i)?.[1]?.toLowerCase();
  if (!encoding) {
    encoding = asciiPreview
      .match(/<meta\s+charset=["']?([^"'\s>]+)/i)?.[1]
      ?.toLowerCase();
  }
  if (!encoding) {
    encoding = asciiPreview
      .match(/<meta[^>]+content=["'][^"']*charset=([^"'\s;]+)/i)?.[1]
      ?.toLowerCase();
  }
  if (
    encoding === "shift_jis" ||
    encoding === "x-sjis" ||
    encoding === "sjis"
  ) {
    encoding = "shift-jis";
  }
  try {
    return new TextDecoder(encoding ?? "utf-8").decode(bytes);
  } catch {
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  }
};
