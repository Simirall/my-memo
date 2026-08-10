/** @jsxImportSource hono/jsx/dom */
import { render } from "hono/jsx/dom";
import { afterEach, describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { SettingsLayout } from "./settings-layout";

function mount(activeSection: "categories" | "tags" | "files") {
  const container = document.createElement("div");
  document.body.appendChild(container);
  render(
    <SettingsLayout activeSection={activeSection}>
      <h1>
        {activeSection === "categories"
          ? "カテゴリー"
          : activeSection === "tags"
            ? "タグ"
            : "ファイル"}
      </h1>
    </SettingsLayout>,
    container,
  );
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("設定レイアウト", () => {
  it("設定メニューをURLリンクとして表示し現在地を示す", async () => {
    mount("categories");

    await expect
      .element(page.getByRole("link", { name: "アカウント" }))
      .toHaveAttribute("href", "/settings/account");
    await expect
      .element(page.getByRole("link", { name: "プラン" }))
      .toHaveAttribute("href", "/settings/plan");
    await expect
      .element(page.getByRole("link", { name: "カテゴリー" }))
      .toHaveAttribute("aria-current", "page");
    await expect
      .element(page.getByRole("link", { name: "タグ" }))
      .toHaveAttribute("href", "/settings/tags");
    await expect
      .element(page.getByRole("link", { name: "ファイル" }))
      .toHaveAttribute("href", "/settings/files");
    await expect
      .element(page.getByLabelText("設定メニューを開く"))
      .toBeInTheDocument();
  });

  it("タグ設定ではタグの現在地を示す", async () => {
    mount("tags");

    await expect
      .element(page.getByRole("link", { name: "タグ" }))
      .toHaveAttribute("aria-current", "page");
  });

  it("ファイル設定ではファイルの現在地を示す", async () => {
    mount("files");

    await expect
      .element(page.getByRole("link", { name: "ファイル" }))
      .toHaveAttribute("aria-current", "page");
  });
});
