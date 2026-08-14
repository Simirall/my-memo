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

function mount(
  activeCategoryId: string | null,
  displayedCategories = categories,
) {
  const container = document.createElement("div");
  container.style.width = "12rem";
  document.body.appendChild(container);
  render(
    <CategoryTabs
      activeCategoryId={activeCategoryId}
      categories={displayedCategories}
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

    let clicked = false;
    const allLink = page.getByRole("link", { name: "すべて" });
    allLink.element().addEventListener(
      "click",
      (event) => {
        clicked = true;
        event.preventDefault();
      },
      { once: true },
    );
    await allLink.click();
    expect(clicked).toBe(true);
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

  it("スクロール可能な端を示し、マウスドラッグ後のリンク遷移だけを抑止する", async () => {
    mount(
      null,
      Array.from({ length: 10 }, (_, index) => ({
        ...categories[0],
        id: `category-${index}`,
        name: `長いカテゴリー名${index}`,
      })),
    );

    const tabs = page
      .getByRole("navigation", { name: "メモのカテゴリー" })
      .element() as HTMLElement;
    const style = document.createElement("style");
    style.textContent = `
      nav[aria-label="メモのカテゴリー"] { display: flex; overflow-x: auto; }
      nav[aria-label="メモのカテゴリー"] > a { flex: 0 0 auto; min-width: 8rem; }
    `;
    document.body.appendChild(style);
    tabs.dispatchEvent(new Event("scroll"));
    await vi.waitFor(() => {
      expect(tabs.scrollWidth).toBeGreaterThan(tabs.clientWidth);
      expect(tabs.style.maskImage).toContain("calc(100% - 3rem)");
    });
    expect(tabs.style.scrollbarWidth).toBe("none");

    tabs.setPointerCapture = vi.fn();
    tabs.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        button: 0,
        clientX: 150,
        pointerId: 1,
        pointerType: "mouse",
      }),
    );
    tabs.dispatchEvent(
      new PointerEvent("pointermove", {
        bubbles: true,
        buttons: 1,
        clientX: 100,
        pointerId: 1,
        pointerType: "mouse",
      }),
    );
    tabs.dispatchEvent(
      new PointerEvent("pointerup", {
        bubbles: true,
        pointerId: 1,
        pointerType: "mouse",
      }),
    );

    expect(tabs.scrollLeft).toBe(50);
    await vi.waitFor(() => {
      expect(tabs.style.maskImage).toContain("transparent, black 3rem");
    });

    const firstLink = page.getByRole("link", { name: "すべて" }).element();
    const nativeDrag = new DragEvent("dragstart", {
      bubbles: true,
      cancelable: true,
    });
    firstLink.dispatchEvent(nativeDrag);
    expect(nativeDrag.defaultPrevented).toBe(true);

    const draggedClick = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
    });
    firstLink.dispatchEvent(draggedClick);
    expect(draggedClick.defaultPrevented).toBe(true);

    let normalClickWasPrevented = true;
    firstLink.addEventListener(
      "click",
      (event) => {
        normalClickWasPrevented = event.defaultPrevented;
        event.preventDefault();
      },
      { once: true },
    );
    const normalClick = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
    });
    firstLink.dispatchEvent(normalClick);
    expect(normalClickWasPrevented).toBe(false);

    vi.mocked(tabs.setPointerCapture).mockClear();
    const scrollLeft = tabs.scrollLeft;
    tabs.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        button: 0,
        clientX: 100,
        pointerId: 2,
        pointerType: "mouse",
      }),
    );
    tabs.dispatchEvent(
      new PointerEvent("pointermove", {
        bubbles: true,
        buttons: 0,
        clientX: 0,
        pointerId: 2,
        pointerType: "mouse",
      }),
    );
    expect(tabs.setPointerCapture).not.toHaveBeenCalled();
    expect(tabs.scrollLeft).toBe(scrollLeft);
  });
});
