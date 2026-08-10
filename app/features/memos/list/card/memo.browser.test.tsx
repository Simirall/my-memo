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
  it("メモカードを本体とフッターに分けた一覧用のサブグリッドとして構成する", async () => {
    mount(<Memo memo={memo} />);

    const card = document.querySelector('[data-memo-card="memo-1"]');
    expect(card).toHaveClass("memo-card-grid");
    expect(card).toHaveClass("memo-card-grid-row");
    expect(card?.children).toHaveLength(2);
  });

  it("カテゴリとAI要約バッジを同じ行に表示する", async () => {
    mount(<Memo memo={{ ...memo, isAiSummary: 1 }} />);

    const categoryLink = document.querySelector(
      'a[href="/categories/category-1"]',
    );
    const aiBadge = document.querySelector(".badge");
    expect(categoryLink?.parentElement).toBe(aiBadge?.parentElement);
  });

  it("タグとタグ編集ボタンを同じ行に表示する", async () => {
    mount(<Memo memo={memo} />);

    const tagList = document.querySelector("[data-memo-tag-list]");
    const tagEditButton = document.querySelector("[data-memo-tag-edit]");
    expect(tagList?.parentElement).toBe(tagEditButton?.parentElement);
  });

  it("タグがない場合はタグ編集ボタンにラベルを表示する", async () => {
    mount(<Memo memo={memo} />);

    const tagEditButton = document.querySelector("[data-memo-tag-edit]");
    expect(tagEditButton?.textContent).toContain("タグを編集");
    expect(tagEditButton).not.toHaveClass("btn-square");
  });

  it("タグがある場合はタグ編集ボタンをアイコンだけで表示する", async () => {
    mount(
      <Memo
        memo={{
          ...memo,
          tags: [{ id: "tag-1", name: "仕事" }],
        }}
      />,
    );

    const tagEditButton = document.querySelector("[data-memo-tag-edit]");
    expect(tagEditButton?.textContent).not.toContain("タグを編集");
    expect(tagEditButton).toHaveClass("btn-square");
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
    await expect.element(categoryLink).toHaveClass("badge");
  });

  it("カテゴリ表示中はメモ内のカテゴリ表示を隠す", async () => {
    mount(<Memo memo={memo} showCategory={false} />);

    await expect
      .element(page.getByRole("link", { name: "仕事" }))
      .not.toBeInTheDocument();
  });

  it("編集ボタンを削除ボタンの左に残り幅いっぱいで表示する", async () => {
    mount(<Memo memo={memo} returnTo="/categories/category-1" />);

    const editLink = page.getByRole("link", { name: "編集" });
    await expect
      .element(editLink)
      .toHaveAttribute(
        "href",
        "/memos/memo-1/edit?returnTo=%2Fcategories%2Fcategory-1",
      );
    await expect.element(editLink).toHaveClass("grow");
    await expect
      .element(page.getByRole("button", { name: "削除" }))
      .toBeVisible();
    expect(
      document.querySelector(
        '[data-memo-card="memo-1"] button[aria-label="削除"] svg',
      ),
    ).not.toBeNull();
  });

  it("外部画像を遅延読み込みとリファラー抑止付きで表示する", () => {
    mount(
      <Memo
        memo={{
          ...memo,
          content: "![外部画像](https://example.invalid/image.png)",
        }}
      />,
    );

    const image = document.querySelector<HTMLImageElement>(
      '[data-memo-card="memo-1"] img[src="https://example.invalid/image.png"]',
    );
    expect(image).toHaveAttribute("loading", "lazy");
    expect(image).toHaveAttribute("decoding", "async");
    expect(image).toHaveAttribute("referrerpolicy", "no-referrer");
  });

  it("GFMの表を表示する", () => {
    mount(
      <Memo
        memo={{
          ...memo,
          content: "| 項目 | 状態 |\n| --- | --- |\n| 確認 | 済み |",
        }}
      />,
    );

    expect(document.querySelector("table")).not.toBeNull();
  });

  it("外部リンクを安全な固定属性で新しいタブに開く", async () => {
    mount(
      <Memo
        memo={{
          ...memo,
          content: "[外部サイト](https://example.com)",
        }}
      />,
    );

    const link = page.getByRole("link", { name: "外部サイト" });
    await expect.element(link).toHaveAttribute("target", "_blank");
    await expect.element(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("壊れた外部画像URLでもメモ表示を維持する", () => {
    mount(
      <Memo
        memo={{
          ...memo,
          content: "![壊れた画像](https://example.invalid/missing.png)",
        }}
      />,
    );

    expect(document.querySelector('[data-memo-card="memo-1"]')).not.toBeNull();
    expect(document.querySelector('img[alt="壊れた画像"]')).not.toBeNull();
  });
});
