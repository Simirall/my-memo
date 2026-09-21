/** @jsxImportSource hono/jsx/dom */
import { render } from "hono/jsx/dom";
import { afterEach, describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { MemoListTable } from "./memo-list-table";

const memo = {
  id: "memo-1",
  userId: "user-1",
  title: "一覧のメモ",
  content: "# 見出し\n\n本文",
  url: "https://example.com/article",
  categoryId: "category-1",
  isAiSummary: 1,
  createdAt: "2026-09-22 00:00:00",
  updatedAt: "2026-09-22 00:00:00",
  category: { id: "category-1", name: "仕事" },
  tags: [
    { id: "tag-1", name: "A" },
    { id: "tag-2", name: "B" },
    { id: "tag-3", name: "C" },
    { id: "tag-4", name: "D" },
  ],
};

afterEach(() => document.body.replaceChildren());

describe("メモのリストビュー", () => {
  it("一覧項目と操作を表示し、タグを3件で省略する", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    render(
      <MemoListTable
        items={[memo]}
        listPath="/"
        query={{ sort: "desc", page: 1 }}
        returnTo="/?type=ai"
        showCategory
      />,
      container,
    );
    container
      .querySelector<HTMLElement>("[data-memo-list-view]")
      ?.removeAttribute("hidden");

    await expect
      .element(page.getByRole("link", { exact: true, name: "一覧のメモ" }))
      .toHaveAttribute("href", "https://example.com/article");
    await expect.element(page.getByLabelText("AI要約")).toBeInTheDocument();
    await expect.element(page.getByText("+1")).toBeInTheDocument();
    await expect
      .element(page.getByRole("button", { name: "詳細: 一覧のメモ" }))
      .toBeInTheDocument();
    await expect
      .element(page.getByRole("link", { name: "編集: 一覧のメモ" }))
      .toHaveAttribute("href", "/memos/memo-1/edit?returnTo=%2F%3Ftype%3Dai");
  });

  it("カテゴリ別一覧ではカテゴリ列を表示しない", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    render(
      <MemoListTable
        items={[memo]}
        listPath="/categories/category-1"
        query={{ sort: "desc", page: 1 }}
        returnTo="/categories/category-1"
        showCategory={false}
      />,
      container,
    );

    expect(container.querySelector("th")?.textContent).not.toContain(
      "カテゴリ",
    );
    expect(
      Array.from(container.querySelectorAll("thead th")).map(
        (heading) => heading.textContent,
      ),
    ).not.toContain("カテゴリ");
  });
});
