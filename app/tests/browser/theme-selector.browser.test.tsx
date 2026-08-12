/** @jsxImportSource hono/jsx/dom */
import { render } from "hono/jsx/dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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
});

afterEach(() => {
  document.body.replaceChildren();
  document.querySelector('meta[name="color-scheme"]')?.remove();
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

    await userEvent.click(page.getByRole("radio", { name: "システム" }));
    expect(document.documentElement).not.toHaveAttribute("data-theme");
    expect(localStorage.getItem("my-memo.theme")).toBe("system");
    expect(document.querySelector('meta[name="color-scheme"]')).toHaveAttribute(
      "content",
      "light dark",
    );
  });

  it("保存済みの選択状態を復元する", async () => {
    localStorage.setItem("my-memo.theme", "light");
    renderThemeSelector();

    await expect
      .element(page.getByRole("radio", { name: "ライト" }))
      .toBeChecked();
  });
});
