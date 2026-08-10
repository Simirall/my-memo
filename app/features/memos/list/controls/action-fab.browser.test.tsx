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
  it("FABのSpeed Dialとして表示する", async () => {
    mount();

    await page.getByRole("button", { name: "作成メニューを開く" }).click();
    await expect
      .element(page.getByRole("link", { name: "メモを作成" }))
      .toHaveAttribute("href", "/memos/create");
    await expect
      .element(page.getByRole("link", { name: "Webページを要約" }))
      .toHaveAttribute("href", "/memos/url-summary");
    await expect
      .element(page.getByRole("link", { name: "Categories" }))
      .not.toBeInTheDocument();
    await expect
      .element(page.getByRole("button", { name: "作成メニューを開く" }))
      .toHaveClass("btn-primary");
  });

  it("CloseでSpeed Dialを閉じる", async () => {
    mount();

    await page.getByRole("button", { name: "作成メニューを開く" }).click();
    await page.getByRole("button", { name: "作成メニューを閉じる" }).click();

    expect(document.activeElement?.closest(".fab")).toBeNull();
    await expect
      .element(page.getByRole("link", { name: "メモを作成" }))
      .toBeInTheDocument();
  });
});
