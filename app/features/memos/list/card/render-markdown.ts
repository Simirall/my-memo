import MarkdownIt from "markdown-it";

const ALLOWED_LINK_PROTOCOLS = new Set(["https:", "mailto:"]);
const ALLOWED_IMAGE_PROTOCOLS = new Set(["https:"]);

interface RenderEnvironment {
  linkSafety: boolean[];
}

function hasExactProtocol(
  value: string | number | null,
  allowed: ReadonlySet<string>,
) {
  if (value === null) return false;

  try {
    return allowed.has(new URL(String(value)).protocol);
  } catch {
    return false;
  }
}

function attribute(name: string, value: string | number | null) {
  return value === null ? "" : ` ${name}="${escapeHtml(String(value))}"`;
}

function renderEnvironment(environment: unknown) {
  return environment as RenderEnvironment;
}

const markdown = new MarkdownIt("zero", {
  html: false,
  breaks: false,
  linkify: true,
  typographer: false,
  maxNesting: 20,
});

markdown.enable([
  "table",
  "code",
  "fence",
  "blockquote",
  "hr",
  "list",
  "reference",
  "heading",
  "lheading",
  "newline",
  "escape",
  "backticks",
  "strikethrough",
  "emphasis",
  "link",
  "image",
  "autolink",
  "entity",
  "linkify",
]);

const { escapeHtml } = markdown.utils;

// URLの採否はタグ別rendererだけで決め、不許可時もラベルを残す。
markdown.validateLink = () => true;

markdown.renderer.rules.link_open = (tokens, index, _options, environment) => {
  const href = tokens[index].attrGet("href");
  const safe = hasExactProtocol(href, ALLOWED_LINK_PROTOCOLS);
  renderEnvironment(environment).linkSafety.push(safe);

  if (!safe || href === null) return "";

  const title = tokens[index].attrGet("title");
  return `<a href="${escapeHtml(String(href))}"${attribute("title", title)} target="_blank" rel="noopener noreferrer">`;
};

markdown.renderer.rules.link_close = (
  _tokens,
  _index,
  _options,
  environment,
) => (renderEnvironment(environment).linkSafety.pop() ? "</a>" : "");

markdown.renderer.rules.image = (
  tokens,
  index,
  options,
  environment,
  renderer,
) => {
  const token = tokens[index];
  const alt = renderer.renderInlineAsText(
    token.children ?? [],
    options,
    environment,
  );
  const src = token.attrGet("src");

  if (!hasExactProtocol(src, ALLOWED_IMAGE_PROTOCOLS) || src === null) {
    return escapeHtml(alt);
  }

  const title = token.attrGet("title");
  return `<img src="${escapeHtml(String(src))}" alt="${escapeHtml(alt)}"${attribute("title", title)} loading="lazy" decoding="async" referrerpolicy="no-referrer">`;
};

markdown.renderer.rules.fence = (tokens, index) =>
  `<pre><code>${escapeHtml(tokens[index].content)}</code></pre>\n`;
markdown.renderer.rules.code_block = (tokens, index) =>
  `<pre><code>${escapeHtml(tokens[index].content)}</code></pre>\n`;
markdown.renderer.rules.ordered_list_open = () => "<ol>\n";
markdown.renderer.rules.th_open = () => "<th>";
markdown.renderer.rules.td_open = () => "<td>";

/** 信頼できないMarkdownを、許可した文書要素だけを含むHTMLへ変換する。 */
export function renderMarkdown(content: string): string {
  return markdown.render(content, {
    linkSafety: [],
  } satisfies RenderEnvironment);
}
