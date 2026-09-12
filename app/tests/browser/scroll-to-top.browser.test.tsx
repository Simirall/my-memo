/** @jsxImportSource hono/jsx/dom */
import { render } from "hono/jsx/dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import ScrollToTopButton from "@/islands/$scroll-to-top";

function mount(showBackButton = false) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  render(<ScrollToTopButton showBackButton={showBackButton} />, container);
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
  it("戻れるページでもスクロール中はトップへ戻る操作を優先し、先頭で戻る操作を表示する", async () => {
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    mount(true);

    const back = page.getByRole("link", { name: "前のページに戻る" });
    const top = page.getByRole("button", { name: "トップへ戻る" });
    await expect.element(back).toBeInTheDocument();
    await expect.element(top).not.toBeInTheDocument();

    setScrollY(120);

    await expect.element(back).not.toBeInTheDocument();
    await top.click();
    expect(scrollTo).toHaveBeenCalledWith({ behavior: "smooth", top: 0 });

    setScrollY(0);

    await expect.element(back).toBeInTheDocument();
    await expect.element(top).not.toBeInTheDocument();
  });

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
