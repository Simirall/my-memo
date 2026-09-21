/** @jsxImportSource hono/jsx/dom */
import { render } from "hono/jsx/dom";
import { afterEach, describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import MemoListViewController from "@/islands/$memo-list-view-controller";

const mount = (listPath: string) => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  render(
    <>
      <MemoListViewController listPath={listPath} />
      <div data-memo-list-content hidden>
        <div data-memo-list-grid data-memo-list-view="card" hidden>
          <article data-memo-card="memo-1">カード本文</article>
        </div>
        <div data-memo-list-view="list" hidden>
          <button data-memo-detail="memo-1" type="button">
            詳細を開く
          </button>
        </div>
      </div>
    </>,
    container,
  );
  return container;
};

afterEach(() => {
  document.body.replaceChildren();
  localStorage.clear();
});

describe("メモ一覧の表示切り替え", () => {
  it("一覧パスごとに表示を保存し、再表示時に復元する", async () => {
    mount("/");
    await page
      .getByRole("checkbox", { name: "リストビューに切り替え" })
      .click();
    expect(localStorage.getItem("my-memo.memo-list-view:/")).toBe("list");
    expect(
      document.querySelector<HTMLElement>('[data-memo-list-view="list"]')
        ?.hidden,
    ).toBe(false);

    document.body.replaceChildren();
    mount("/categories/category-1");
    await expect
      .element(page.getByRole("checkbox", { name: "リストビューに切り替え" }))
      .not.toBeChecked();

    document.body.replaceChildren();
    mount("/");
    await expect
      .element(page.getByRole("checkbox", { name: "カードビューに切り替え" }))
      .toBeChecked();
  });

  it("詳細にカードを移し、閉じると元へ戻してボタンへフォーカスする", async () => {
    localStorage.setItem("my-memo.memo-list-view:/", "list");
    mount("/");
    const trigger = page.getByRole("button", { name: "詳細を開く" });
    await trigger.click();
    const dialog = document.querySelector<HTMLDialogElement>("dialog");
    expect(dialog?.open).toBe(true);
    expect(dialog?.querySelector("[data-memo-card]")?.textContent).toBe(
      "カード本文",
    );

    dialog?.close();
    await new Promise((resolve) => window.setTimeout(resolve, 100));
    expect(
      document.querySelector("[data-memo-list-grid] [data-memo-card]")
        ?.textContent,
    ).toBe("カード本文");
    expect(document.activeElement).toBe(
      document.querySelector('[data-memo-detail="memo-1"]'),
    );
  });
});
