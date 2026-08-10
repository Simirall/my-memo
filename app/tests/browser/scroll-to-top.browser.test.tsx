/** @jsxImportSource hono/jsx/dom */
import { render } from "hono/jsx/dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import ScrollToTopButton from "@/islands/$scroll-to-top";

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
  it("ページをスクロールした場合だけキーボード操作の対象にする", async () => {
    mount();

    const button = page.getByRole("button", { name: "トップへ戻る" });
    await expect.element(button).toHaveAttribute("tabindex", "-1");

    setScrollY(120);

    await vi.waitFor(() => {
      expect(button.element().tabIndex).toBe(0);
    });
  });

  it("クリックするとページ先頭へスムーズに戻る", async () => {
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    mount();
    setScrollY(120);

    await page.getByRole("button", { name: "トップへ戻る" }).click();

    expect(scrollTo).toHaveBeenCalledWith({ behavior: "smooth", top: 0 });
  });
});
