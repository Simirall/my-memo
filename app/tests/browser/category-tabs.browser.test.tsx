/** @jsxImportSource hono/jsx/dom */
import { render } from "hono/jsx/dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import CategoryTabs from "@/islands/$category-tabs";

const categories = [
  {
    id: "category-1",
    userId: "user-1",
    name: "仕事",
    createdAt: "2026-08-02 00:00:00",
    updatedAt: "2026-08-02 00:00:00",
  },
  {
    id: "category-2",
    userId: "user-1",
    name: "個人",
    createdAt: "2026-08-02 00:00:00",
    updatedAt: "2026-08-02 00:00:00",
  },
];

function mount(activeCategoryId: string | null) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  render(
    <CategoryTabs
      activeCategoryId={activeCategoryId}
      categories={categories}
      query={{ sort: "asc", page: 3, type: "ai", tag: "tag-1" }}
    />,
    container,
  );
}

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("カテゴリタブ", () => {
  it("すべてと自分のカテゴリをURLリンクのタブとして表示する", async () => {
    mount(null);

    await expect
      .element(page.getByRole("link", { name: "すべて" }))
      .toHaveAttribute("aria-current", "page");
    await expect
      .element(page.getByRole("link", { name: "仕事" }))
      .toHaveAttribute(
        "href",
        "/categories/category-1?sort=asc&type=ai&tag=tag-1",
      );
  });

  it("未対応ブラウザでは選択中のカテゴリが見える位置までスクロールする", async () => {
    const scrollIntoView = vi
      .spyOn(HTMLElement.prototype, "scrollIntoView")
      .mockImplementation(() => {});
    vi.stubGlobal("CSS", { supports: vi.fn(() => false) });

    mount("category-2");

    await vi.waitFor(() => {
      expect(scrollIntoView).toHaveBeenCalledWith({
        block: "nearest",
        inline: "nearest",
      });
    });
    await expect
      .element(page.getByRole("link", { name: "個人" }))
      .toHaveAttribute("aria-current", "page");
  });

  it("対応ブラウザでは初期レイアウト時のスクロールへ任せる", async () => {
    const scrollIntoView = vi
      .spyOn(HTMLElement.prototype, "scrollIntoView")
      .mockImplementation(() => {});
    vi.stubGlobal("CSS", { supports: vi.fn(() => true) });

    mount("category-2");

    await vi.waitFor(() => {
      expect(page.getByRole("link", { name: "個人" }).element()).not.toBeNull();
    });
    expect(scrollIntoView).not.toHaveBeenCalled();
  });
});
