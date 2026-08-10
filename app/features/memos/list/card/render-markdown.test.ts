import { describe, expect, it } from "vitest";
import { renderMarkdown } from "./render-markdown";

describe("安全なMarkdown表示", () => {
  it("メモで案内している見出しと強調を表示する", () => {
    const html = renderMarkdown("# 見出し\n\n**強調**");

    expect(html).toContain("<h1>見出し</h1>");
    expect(html).toContain("<strong>強調</strong>");
  });

  it("タスクリスト記法をcheckboxへ変換しない", () => {
    const html = renderMarkdown("- [x] 完了\n- [ ] 未完了");

    expect(html).toContain("[x] 完了");
    expect(html).toContain("[ ] 未完了");
    expect(html).not.toContain("<input");
  });

  it("生HTMLを実行せず文字として表示する", () => {
    const html = renderMarkdown(
      '<script>alert(1)</script><img src="https://example.com/x" onerror="alert(1)">',
    );

    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("&lt;img src=");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img ");
  });

  it("HTTPSとメールリンクだけを固定属性で表示する", () => {
    const html = renderMarkdown(
      "[HTTPS](https://example.com) [メール](mailto:test@example.com) [相対](/memo) [HTTP](http://example.com)",
    );

    expect(html).toContain(
      '<a href="https://example.com" target="_blank" rel="noopener noreferrer">HTTPS</a>',
    );
    expect(html).toContain(
      '<a href="mailto:test@example.com" target="_blank" rel="noopener noreferrer">メール</a>',
    );
    expect(html).toContain(" 相対 ");
    expect(html).toContain(" HTTP");
    expect(html).not.toContain('href="/memo"');
    expect(html).not.toContain('href="http://example.com"');
  });

  it("危険または曖昧なURLをリンクとして出力しない", () => {
    const cases = [
      "[JS](javascript:alert(1))",
      "[改行](java%0Ascript:alert(1))",
      "[タブ](java%09script:alert(1))",
      "[相対](/relative)",
      "[省略](//example.com/path)",
      "[data](data:text/html,test)",
      "[blob](blob:https://example.com/id)",
      "[file](file:///tmp/test)",
      "[ftp](ftp://example.com/file)",
    ];

    for (const markdown of cases) {
      const html = renderMarkdown(markdown);
      expect(html).not.toContain("<a ");
      expect(html).not.toContain("](");
    }
  });

  it("HTTPS画像だけを負荷とリファラーを抑える属性付きで表示する", () => {
    const html = renderMarkdown(
      "![安全](https://images.example.com/a.png) ![危険](data:image/svg+xml,test) ![相対](/a.png) ![省略](//example.com/a.png)",
    );

    expect(html).toContain(
      '<img src="https://images.example.com/a.png" alt="安全" loading="lazy" decoding="async" referrerpolicy="no-referrer">',
    );
    expect(html).toContain("危険");
    expect(html).toContain("相対");
    expect(html).toContain("省略");
    expect(html).not.toContain("](");
    expect(html.match(/<img /g)).toHaveLength(1);
  });

  it("任意属性とDOM clobbering用の識別子を残さない", () => {
    const html = renderMarkdown(
      '# Markdown見出し\n\n<h1 id="location" class="x" style="color:red" onclick="alert(1)">HTML見出し</h1>',
    );

    expect(html).toContain("<h1>Markdown見出し</h1>");
    expect(html).not.toContain('<h1 id="location"');
    expect(html).toContain("&lt;h1 id=&quot;location&quot;");
  });

  it("Markdown由来の任意属性を出力しない", () => {
    const html = renderMarkdown(`
~~~javascript title="危険"
alert(1)
~~~

| 左 | 中央 |
| :--- | :---: |
| A | B |

3. 三番目
`);

    expect(html).not.toContain("class=");
    expect(html).not.toContain("style=");
    expect(html).not.toContain("start=");
    expect(html).toContain("<pre><code>alert(1)\n</code></pre>");
  });
});
