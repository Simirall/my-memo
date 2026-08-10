/** @jsxImportSource hono/jsx/dom */
import { render } from "hono/jsx/dom";
import { afterEach, describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { CategoryTabs } from "./category-tabs";

const category = {
  id: "category-1",
  userId: "user-1",
  name: "仕事",
  createdAt: "2026-08-02 00:00:00",
  updatedAt: "2026-08-02 00:00:00",
};

afterEach(() => {
  document.body.replaceChildren();
});

describe("カテゴリタブ", () => {
  it("すべてと自分のカテゴリをURLリンクのタブとして表示する", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    render(
      <CategoryTabs
        activeCategoryId={null}
        categories={[category]}
        query={{ sort: "asc", page: 3, type: "ai", tag: "tag-1" }}
      />,
      container,
    );

    await expect
      .element(page.getByRole("navigation", { name: "メモのカテゴリー" }))
      .toHaveClass("sticky");
    await expect
      .element(page.getByRole("navigation", { name: "メモのカテゴリー" }))
      .toHaveClass("top-20");
    await expect
      .element(page.getByRole("navigation", { name: "メモのカテゴリー" }))
      .toHaveClass("bg-secondary/30");
    await expect
      .element(page.getByRole("link", { name: "すべて" }))
      .toHaveAttribute("aria-current", "page");
    await expect
      .element(page.getByRole("link", { name: "すべて" }))
      .toHaveClass("!bg-secondary-content");
    await expect
      .element(page.getByRole("link", { name: "すべて" }))
      .toHaveClass("!text-secondary");
    await expect
      .element(page.getByRole("link", { name: "仕事" }))
      .toHaveClass("!text-secondary-content");
    await expect
      .element(page.getByRole("link", { name: "仕事" }))
      .toHaveAttribute(
        "href",
        "/categories/category-1?sort=asc&type=ai&tag=tag-1",
      );
  });
});
