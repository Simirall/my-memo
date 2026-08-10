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

    await page.getByRole("button", { name: "Open quick actions" }).click();
    await expect
      .element(page.getByRole("link", { name: "Create Memo" }))
      .toHaveAttribute("href", "/memos/create");
    await expect
      .element(page.getByRole("link", { name: "Create WebPage Summary" }))
      .toHaveAttribute("href", "/memos/url-summary");
    await expect
      .element(page.getByRole("link", { name: "Categories" }))
      .not.toBeInTheDocument();
    await expect
      .element(page.getByRole("button", { name: "Open quick actions" }))
      .toHaveClass("btn-primary");
  });

  it("CloseでSpeed Dialを閉じる", async () => {
    mount();

    await page.getByRole("button", { name: "Open quick actions" }).click();
    await page.getByRole("button", { name: "Close quick actions" }).click();

    expect(document.activeElement?.closest(".fab")).toBeNull();
    await expect
      .element(page.getByRole("link", { name: "Create Memo" }))
      .toBeInTheDocument();
  });
});
