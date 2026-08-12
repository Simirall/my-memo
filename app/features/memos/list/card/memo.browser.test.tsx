/** @jsxImportSource hono/jsx/dom */
import { render } from "hono/jsx/dom";
import { afterEach, describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { Memo } from "./memo";

const category = {
  id: "category-1",
  userId: "user-1",
  name: "仕事",
  createdAt: "2026-08-02 00:00:00",
  updatedAt: "2026-08-02 00:00:00",
};

const memo = {
  id: "memo-1",
  userId: "user-1",
  title: "テストメモ",
  content: "本文",
  url: null,
  categoryId: category.id,
  isAiSummary: 0,
  createdAt: "2026-08-02 00:00:00",
  updatedAt: "2026-08-02 00:00:00",
  category,
};

function mount(node: Parameters<typeof render>[0]) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  render(node, container);
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("メモ表示", () => {
  it("既存の危険なURLをリンクとして表示しない", async () => {
    mount(
      <Memo
        memo={{
          ...memo,
          url: "javascript:alert(document.cookie)",
          linkPreview: {
            normalizedUrl: "javascript:alert(document.cookie)",
            title: "危険なプレビュー",
            description: null,
            imageUrl: null,
            cardType: "summary",
          },
        }}
      />,
    );

    await expect
      .element(page.getByRole("heading", { name: "テストメモ" }))
      .toBeVisible();
    await expect
      .element(page.getByRole("link", { name: "テストメモ" }))
      .not.toBeInTheDocument();
    await expect
      .element(page.getByText("危険なプレビュー"))
      .not.toBeInTheDocument();
  });

  it("メモタイトルを残してOGP全体を外部リンクとして表示する", async () => {
    mount(
      <Memo
        memo={{
          ...memo,
          url: "https://example.com/article",
          linkPreview: {
            normalizedUrl: "https://example.com/article",
            title: "OGPタイトル",
            description: "OGP説明",
            imageUrl: "https://images.example.com/card.jpg",
            cardType: "summary",
          },
        }}
      />,
    );

    await expect
      .element(page.getByRole("link", { name: "テストメモ" }))
      .toHaveAttribute("href", "https://example.com/article");
    const preview = page.getByRole("link", {
      name: "リンクプレビュー: OGPタイトル",
    });
    await expect
      .element(preview)
      .toHaveAttribute("href", "https://example.com/article");
    await expect.element(preview).toHaveAttribute("target", "_blank");
    await expect.element(page.getByText("OGP説明")).toBeVisible();

    const image = document.querySelector<HTMLImageElement>(
      "[data-link-preview-image]",
    );
    expect(image?.getAttribute("loading")).toBe("lazy");
    expect(image?.getAttribute("referrerpolicy")).toBe("no-referrer");
    expect(image?.getAttribute("alt")).toBe("");
  });

  it("画像がないOGPでもタイトルと説明を表示する", async () => {
    mount(
      <Memo
        memo={{
          ...memo,
          url: "https://example.com/article",
          linkPreview: {
            normalizedUrl: "https://example.com/article",
            title: "画像なし記事",
            description: "画像がなくても読める説明",
            imageUrl: null,
            cardType: "summary",
          },
        }}
      />,
    );

    await expect.element(page.getByText("画像なし記事")).toBeVisible();
    await expect
      .element(page.getByText("画像がなくても読める説明"))
      .toBeVisible();
    expect(document.querySelector("[data-link-preview-image]")).toBeNull();
  });

  it("本文がない場合は本文領域を表示しない", async () => {
    mount(<Memo memo={{ ...memo, content: null }} />);

    expect(document.querySelector("[data-memo-content]")).toBeNull();
    await expect
      .element(page.getByRole("heading", { name: "テストメモ" }))
      .toBeVisible();
  });

  it("タグの有無にかかわらず対象メモのタグを編集できる", async () => {
    mount(<Memo memo={memo} />);
    await expect
      .element(page.getByRole("button", { name: "タグを編集: テストメモ" }))
      .toBeVisible();

    document.body.replaceChildren();
    mount(
      <Memo
        memo={{
          ...memo,
          tags: [{ id: "tag-1", name: "仕事" }],
        }}
      />,
    );
    await expect
      .element(page.getByRole("button", { name: "タグを編集: テストメモ" }))
      .toBeVisible();
  });

  it("添付ファイルがない一覧カードでは見出しを表示しない", async () => {
    mount(<Memo memo={memo} />);

    expect(
      document.querySelector('[data-attachment-manager="memo-1"] h3'),
    ).toBeNull();
  });

  it("全件表示ではカテゴリをfolder-open付きテキストで表示する", async () => {
    mount(<Memo memo={memo} />);

    const categoryLink = page.getByRole("link", { name: "仕事" });
    await expect
      .element(categoryLink)
      .toHaveAttribute("href", "/categories/category-1");
  });

  it("カテゴリ表示中はメモ内のカテゴリ表示を隠す", async () => {
    mount(<Memo memo={memo} showCategory={false} />);

    await expect
      .element(page.getByRole("link", { name: "仕事" }))
      .not.toBeInTheDocument();
  });

  it("一覧条件を保持して編集でき、削除操作も表示する", async () => {
    mount(<Memo memo={memo} returnTo="/categories/category-1" />);

    const editLink = page.getByRole("link", { name: "編集" });
    await expect
      .element(editLink)
      .toHaveAttribute(
        "href",
        "/memos/memo-1/edit?returnTo=%2Fcategories%2Fcategory-1",
      );
    await expect
      .element(page.getByRole("button", { name: "削除" }))
      .toBeVisible();
  });
});
