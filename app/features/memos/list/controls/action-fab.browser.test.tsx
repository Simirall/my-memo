/** @jsxImportSource hono/jsx/dom */
import { render } from "hono/jsx/dom";
import { afterEach, describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { ActionFab } from "./$action-fab";

function mount() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  render(<ActionFab />, container);
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("操作メニュー", () => {
  it("作成メニューから2つの作成方法へ移動できる", async () => {
    mount();

    await page.getByRole("button", { name: "作成メニューを開く" }).click();
    await expect
      .element(page.getByRole("link", { name: "メモを作成" }))
      .toHaveAttribute("href", "/memos/create");
    await expect
      .element(page.getByRole("link", { name: "WebページをAI要約" }))
      .toHaveAttribute("href", "/memos/url-summary");
    await expect
      .element(page.getByRole("link", { name: "Categories" }))
      .not.toBeInTheDocument();
  });

  it("閉じる操作後はメニュー内からフォーカスを外す", async () => {
    mount();

    await page.getByRole("button", { name: "作成メニューを開く" }).click();
    await page.getByRole("button", { name: "作成メニューを閉じる" }).click();

    expect(document.activeElement?.closest(".fab")).toBeNull();
  });
});
