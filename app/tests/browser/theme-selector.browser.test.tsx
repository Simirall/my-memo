/** @jsxImportSource hono/jsx/dom */
import { render } from "hono/jsx/dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { ThemeSelector } from "@/islands/$theme-selector";

const renderThemeSelector = () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  render(<ThemeSelector />, container);
};

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  const meta = document.createElement("meta");
  meta.name = "color-scheme";
  meta.content = "light dark";
  document.head.appendChild(meta);
  const themeColor = document.createElement("meta");
  themeColor.name = "theme-color";
  themeColor.content = "#20252e";
  document.head.appendChild(themeColor);
});

afterEach(() => {
  document.body.replaceChildren();
  document.querySelector('meta[name="color-scheme"]')?.remove();
  document.querySelector('meta[name="theme-color"]')?.remove();
  vi.restoreAllMocks();
});

describe("テーマ切り替え", () => {
  it("システム・ライト・ダークをアクセシブルな選択肢として表示する", async () => {
    renderThemeSelector();

    await expect
      .element(page.getByRole("radio", { name: "システム" }))
      .toBeChecked();
    await expect
      .element(page.getByRole("radio", { name: "ライト" }))
      .toBeInTheDocument();
    await expect
      .element(page.getByRole("radio", { name: "ダーク" }))
      .toBeInTheDocument();
  });

  it("選択したテーマを適用して保存しシステムへ戻せる", async () => {
    renderThemeSelector();

    await userEvent.click(page.getByRole("radio", { name: "ダーク" }));
    expect(document.documentElement.dataset.theme).toBe("dim");
    expect(localStorage.getItem("my-memo.theme")).toBe("dark");
    expect(document.querySelector('meta[name="color-scheme"]')).toHaveAttribute(
      "content",
      "dark",
    );
    expect(document.querySelector('meta[name="theme-color"]')).toHaveAttribute(
      "content",
      "#20252e",
    );

    await userEvent.click(page.getByRole("radio", { name: "ライト" }));
    expect(document.querySelector('meta[name="theme-color"]')).toHaveAttribute(
      "content",
      "#f7f3ed",
    );

    await userEvent.click(page.getByRole("radio", { name: "システム" }));
    expect(document.documentElement).not.toHaveAttribute("data-theme");
    expect(localStorage.getItem("my-memo.theme")).toBe("system");
    expect(document.querySelector('meta[name="color-scheme"]')).toHaveAttribute(
      "content",
      "light dark",
    );
    expect(document.querySelector('meta[name="theme-color"]')).toHaveAttribute(
      "content",
      matchMedia("(prefers-color-scheme: dark)").matches
        ? "#20252e"
        : "#f7f3ed",
    );
  });

  it("保存済みの選択状態を復元する", async () => {
    localStorage.setItem("my-memo.theme", "light");
    renderThemeSelector();

    await expect
      .element(page.getByRole("radio", { name: "ライト" }))
      .toBeChecked();
  });

  it("システム選択時だけOSの配色変更へ追随する", async () => {
    const darkMode = new EventTarget() as EventTarget & { matches: boolean };
    darkMode.matches = false;
    vi.spyOn(window, "matchMedia").mockReturnValue(
      darkMode as unknown as MediaQueryList,
    );
    renderThemeSelector();

    await expect
      .element(page.getByRole("radio", { name: "システム" }))
      .toBeChecked();
    darkMode.dispatchEvent(
      Object.assign(new Event("change"), { matches: true }),
    );
    expect(document.querySelector('meta[name="theme-color"]')).toHaveAttribute(
      "content",
      "#20252e",
    );

    await userEvent.click(page.getByRole("radio", { name: "ライト" }));
    darkMode.dispatchEvent(
      Object.assign(new Event("change"), { matches: true }),
    );
    expect(document.querySelector('meta[name="theme-color"]')).toHaveAttribute(
      "content",
      "#f7f3ed",
    );
  });
});
