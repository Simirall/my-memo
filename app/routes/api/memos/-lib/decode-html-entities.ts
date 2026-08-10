export const decodeHtmlEntities = (text: string): string => {
  const entities: Record<string, string> = {
    "&quot;": '"',
    "&#34;": '"',
    "&apos;": "'",
    "&#39;": "'",
    "&amp;": "&",
    "&#38;": "&",
    "&lt;": "<",
    "&#60;": "<",
    "&gt;": ">",
    "&#62;": ">",
    "&nbsp;": " ",
    "&#160;": " ",
  };

  return text.replace(/&[#a-z0-9]+;/gi, (match) => entities[match] || match);
};
