/** @jsxImportSource hono/jsx/dom */
import { render } from "hono/jsx/dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { SortableCategoryList } from "@/islands/$sortable-category-list";

const categories = [
  { id: "first", name: "先頭" },
  { id: "second", name: "末尾" },
];

const mount = () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  render(<SortableCategoryList initialCategories={categories} />, container);
};

const categoryOrder = () =>
  [...document.querySelectorAll<HTMLElement>("[data-category-id]")].map(
    (element) => element.dataset.categoryId,
  );

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("カテゴリー並べ替え", () => {
  it("上下矢印キーで移動し、保存中はハンドルを無効にする", async () => {
    let resolveFetch: (response: Response) => void = () => undefined;
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    mount();

    const handle = page.getByRole("button", {
      name: "カテゴリー「末尾」を並べ替え",
    });
    await userEvent.click(handle);
    await userEvent.keyboard("{ArrowUp}");

    expect(categoryOrder()).toEqual(["second", "first"]);
    await expect.element(handle).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/categories/reorder",
      expect.objectContaining({
        body: JSON.stringify({ categoryIds: ["second", "first"] }),
      }),
    );

    resolveFetch(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    await expect.element(page.getByText("保存しました。")).toBeVisible();
    await expect.element(handle).not.toBeDisabled();
  });

  it("ハンドルのポインタ操作で移動する", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ ok: true }), { status: 200 }),
        ),
    );
    mount();

    const firstHandle = document.querySelector<HTMLButtonElement>(
      '[aria-label="カテゴリー「先頭」を並べ替え"]',
    );
    const secondRow = document.querySelector<HTMLElement>(
      '[data-category-id="second"]',
    );
    vi.spyOn(
      firstHandle as HTMLButtonElement,
      "setPointerCapture",
    ).mockImplementation(() => undefined);
    vi.spyOn(document, "elementFromPoint").mockReturnValue(secondRow);

    firstHandle?.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        button: 0,
        isPrimary: true,
        pointerId: 1,
      }),
    );
    firstHandle?.dispatchEvent(
      new PointerEvent("pointermove", {
        bubbles: true,
        clientX: 1,
        clientY: 1,
        pointerId: 1,
      }),
    );
    firstHandle?.dispatchEvent(
      new PointerEvent("pointerup", { bubbles: true, pointerId: 1 }),
    );

    await expect.poll(categoryOrder).toEqual(["second", "first"]);
    await expect.element(page.getByText("保存しました。")).toBeVisible();
  });

  it("保存失敗時は元の並びへ戻して通知する", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 500 })),
    );
    mount();

    await userEvent.click(
      page.getByRole("button", { name: "カテゴリー「末尾」を並べ替え" }),
    );
    await userEvent.keyboard("{ArrowUp}");

    await expect
      .element(page.getByText("保存できませんでした。元の並び順に戻しました。"))
      .toBeVisible();
    expect(categoryOrder()).toEqual(["first", "second"]);
  });
});
