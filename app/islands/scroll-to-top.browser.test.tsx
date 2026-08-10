/** @jsxImportSource hono/jsx/dom */
import { render } from "hono/jsx/dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import ScrollToTopButton from "./$scroll-to-top";

function mount() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  render(<ScrollToTopButton />, container);
}

function setScrollY(value: number) {
  Object.defineProperty(window, "scrollY", {
    configurable: true,
    value,
  });
  window.dispatchEvent(new Event("scroll"));
}

afterEach(() => {
  document.body.replaceChildren();
  setScrollY(0);
  vi.restoreAllMocks();
});

describe("トップへ戻るボタン", () => {
  it("ページをスクロールすると表示する", async () => {
    mount();

    const button = page.getByRole("button", { name: "トップへ戻る" });
    await expect.element(button).toHaveClass("opacity-0");
    await expect.element(button).toHaveClass("pointer-events-none");
    await expect.element(button).toHaveClass("transition-opacity");

    setScrollY(120);

    await expect.element(button).toBeVisible();
    await expect.element(button).toHaveClass("bottom-4");
    await expect.element(button).toHaveClass("left-4");
    await expect.element(button).toHaveClass("opacity-100");
  });

  it("クリックするとページ先頭へスムーズに戻る", async () => {
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    mount();
    setScrollY(120);

    await page.getByRole("button", { name: "トップへ戻る" }).click();

    expect(scrollTo).toHaveBeenCalledWith({ behavior: "smooth", top: 0 });
  });
});
