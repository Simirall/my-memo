/** @jsxImportSource hono/jsx/dom */
import { render } from "hono/jsx/dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { SortableCategoryList } from "@/islands/$sortable-category-list";

const categories = [
  { id: "first", name: "先頭", excludeFromAll: false },
  { id: "second", name: "末尾", excludeFromAll: true },
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

describe("カテゴリー名の変更", () => {
  it("削除ボタンの左に編集ボタンを置き、現在名を選択して開く", async () => {
    mount();

    const editButton = page.getByRole("button", {
      name: "カテゴリー「先頭」を編集",
    });
    const editElement = await editButton.element();
    expect(editElement.nextElementSibling?.tagName).toBe("FORM");

    await userEvent.click(editButton);
    await expect
      .element(page.getByRole("dialog", { name: "カテゴリー名を変更" }))
      .toBeVisible();
    const input = page.getByRole("textbox", { name: "カテゴリー名" });
    await expect.element(input).toHaveValue("先頭");
    await expect.element(input).toHaveFocus();
    await expect
      .element(
        page.getByRole("checkbox", { name: "「すべて」の一覧に表示しない" }),
      )
      .not.toBeChecked();
    await expect.element(page.getByText("private")).toBeVisible();
  });

  it("キャンセル・Escape・背景クリックで閉じてフォーカスを戻す", async () => {
    mount();
    const editButton = page.getByRole("button", {
      name: "カテゴリー「先頭」を編集",
    });
    const dialogIsOpen = () =>
      document.querySelector<HTMLDialogElement>("dialog")?.open;

    await userEvent.click(editButton);
    await userEvent.click(
      page.getByRole("button", { name: "キャンセル", exact: true }),
    );
    await expect.poll(dialogIsOpen).toBe(false);
    await expect.element(editButton).toHaveFocus();

    await userEvent.click(editButton);
    await userEvent.keyboard("{Escape}");
    await expect.poll(dialogIsOpen).toBe(false);
    await expect.element(editButton).toHaveFocus();

    await userEvent.click(editButton);
    await userEvent.click(
      page.getByRole("button", { name: "カテゴリー名の変更をキャンセル" }),
    );
    await expect.poll(dialogIsOpen).toBe(false);
    await expect.element(editButton).toHaveFocus();
  });

  it("保存成功時は一覧を更新して完了を通知する", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ ok: true, name: "更新後", excludeFromAll: true }),
        {
          status: 200,
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    mount();

    await userEvent.click(
      page.getByRole("button", { name: "カテゴリー「先頭」を編集" }),
    );
    await userEvent.click(
      page.getByRole("checkbox", { name: "「すべて」の一覧に表示しない" }),
    );
    await page
      .getByRole("textbox", { name: "カテゴリー名" })
      .fill("  更新後  ");
    await userEvent.click(page.getByRole("button", { name: "保存" }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/categories/rename/first",
      expect.objectContaining({
        body: JSON.stringify({
          name: "  更新後  ",
          excludeFromAll: true,
        }),
      }),
    );
    await expect
      .element(page.getByRole("link", { name: "更新後すべてで非表示" }))
      .toBeVisible();
    await expect
      .element(page.getByText("カテゴリーを変更しました。"))
      .toBeVisible();
  });

  it("保存失敗時はモーダルと入力値を保持して再送信できる", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            message: "同じ名前のカテゴリーがすでに登録されています。",
          }),
          { status: 409 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ ok: true, name: "別の名前", excludeFromAll: true }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    mount();

    await userEvent.click(
      page.getByRole("button", { name: "カテゴリー「先頭」を編集" }),
    );
    const input = page.getByRole("textbox", { name: "カテゴリー名" });
    await input.fill("末尾");
    const checkbox = page.getByRole("checkbox", {
      name: "「すべて」の一覧に表示しない",
    });
    await userEvent.click(checkbox);
    await userEvent.click(page.getByRole("button", { name: "保存" }));

    await expect.element(checkbox).toBeChecked();
    await expect
      .element(page.getByRole("alert"))
      .toHaveTextContent("同じ名前のカテゴリーがすでに登録されています。");
    await expect.element(input).toHaveValue("末尾");

    await input.fill("別の名前");
    await userEvent.click(page.getByRole("button", { name: "保存" }));
    await expect
      .element(page.getByRole("link", { name: "別の名前" }))
      .toBeVisible();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
