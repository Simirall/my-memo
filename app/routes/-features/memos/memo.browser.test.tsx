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

describe("メモ表示", () => {
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
