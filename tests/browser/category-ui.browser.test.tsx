/** @jsxImportSource hono/jsx/dom */
import { render } from "hono/jsx/dom";
import { afterEach, describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { CategoryTabs } from "../../app/components/category-tabs";
import { Memo } from "../../app/components/memo";
import { ActionFab } from "../../app/islands/action-fab";

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
  aiGenerated: 0,
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

describe("カテゴリUI", () => {
  it("操作メニューをFABのSpeed Dialとして表示する", async () => {
    mount(<ActionFab />);

    await page.getByRole("button", { name: "Open quick actions" }).click();
    await expect
      .element(page.getByRole("link", { name: "Create Memo" }))
      .toHaveAttribute("href", "/memos/create");
    await expect
      .element(page.getByRole("link", { name: "Create WebPage Summary" }))
      .toHaveAttribute("href", "/memos/url-summary");
    await expect
      .element(page.getByRole("link", { name: "Categories" }))
      .toHaveAttribute("href", "/categories");
    await expect
      .element(page.getByRole("button", { name: "Open quick actions" }))
      .toHaveClass("btn-primary");
  });

  it("CloseでSpeed Dialを閉じる", async () => {
    mount(<ActionFab />);

    await page.getByRole("button", { name: "Open quick actions" }).click();
    await page.getByRole("button", { name: "Close quick actions" }).click();

    expect(document.activeElement?.closest(".fab")).toBeNull();
    await expect
      .element(page.getByRole("link", { name: "Create Memo" }))
      .toBeInTheDocument();
  });

  it("すべてと自分のカテゴリをURLリンクのタブとして表示する", async () => {
    mount(<CategoryTabs activeCategoryId={null} categories={[category]} />);

    await expect
      .element(page.getByRole("link", { name: "すべて" }))
      .toHaveAttribute("aria-current", "page");
    await expect
      .element(page.getByRole("link", { name: "仕事" }))
      .toHaveAttribute("href", "/categories/category-1");
  });

  it("全件表示ではカテゴリをfolder-open付きテキストで表示する", async () => {
    mount(<Memo memo={memo} />);

    const categoryLink = page.getByRole("link", { name: "仕事" });
    await expect
      .element(categoryLink)
      .toHaveAttribute("href", "/categories/category-1");
    await expect.element(categoryLink).not.toHaveClass("badge");
  });

  it("カテゴリ表示中はメモ内のカテゴリ表示を隠す", async () => {
    mount(<Memo memo={memo} showCategory={false} />);

    await expect
      .element(page.getByRole("link", { name: "仕事" }))
      .not.toBeInTheDocument();
  });
});
