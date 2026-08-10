/** @jsxImportSource hono/jsx/dom */
import { render } from "hono/jsx/dom";
import { afterEach, describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { MemoPagination } from "./memo-pagination";

afterEach(() => {
  document.body.replaceChildren();
});

const renderPagination = (component: ReturnType<typeof MemoPagination>) => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  render(component, container);
  return container;
};

describe("メモ一覧ページング", () => {
  it("1ページだけの場合は表示しない", () => {
    const container = renderPagination(
      <MemoPagination
        hasNextPage={false}
        pathname="/"
        query={{ sort: "desc", page: 1 }}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("先頭ページでは次ページだけを表示して条件を維持する", async () => {
    renderPagination(
      <MemoPagination
        hasNextPage
        pathname="/"
        query={{ sort: "asc", page: 1, type: "ai" }}
      />,
    );

    await expect
      .element(page.getByRole("link", { name: "1ページ目" }))
      .toHaveAttribute("aria-current", "page");
    await expect
      .element(page.getByRole("link", { name: "2ページ目" }))
      .toHaveAttribute("href", "/?sort=asc&page=2&type=ai");
    await expect
      .element(page.getByRole("button", { name: "前へ" }))
      .toBeDisabled();
  });

  it("深いページでは先頭・省略・過去2ページ・現在・次だけを表示する", async () => {
    renderPagination(
      <MemoPagination
        hasNextPage
        pathname="/categories/category-1"
        query={{ sort: "desc", page: 6, tag: "tag-1" }}
      />,
    );

    await expect.element(page.getByText("…")).toBeInTheDocument();
    for (const pageNumber of [1, 4, 5, 6, 7]) {
      await expect
        .element(page.getByRole("link", { name: `${pageNumber}ページ目` }))
        .toBeInTheDocument();
    }
    await expect
      .element(page.getByRole("link", { name: "6ページ目" }))
      .toHaveAttribute("aria-current", "page");
    await expect
      .element(page.getByRole("link", { name: "7ページ目" }))
      .toHaveAttribute("href", "/categories/category-1?page=7&tag=tag-1");
    await expect
      .element(page.getByRole("link", { name: "8ページ目" }))
      .not.toBeInTheDocument();
  });

  it("最終ページでは次への操作と未来のページ番号を無効化する", async () => {
    renderPagination(
      <MemoPagination
        hasNextPage={false}
        pathname="/"
        query={{ sort: "desc", page: 3 }}
      />,
    );

    await expect
      .element(page.getByRole("button", { name: "次へ" }))
      .toBeDisabled();
    await expect
      .element(page.getByRole("link", { name: "4ページ目" }))
      .not.toBeInTheDocument();
  });
});
