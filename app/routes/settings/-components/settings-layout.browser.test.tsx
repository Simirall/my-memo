import { afterEach, describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { render } from "@/tests/browser/render";
import { navigation } from "../../../../tests/setup/navigation";
import { SettingsLayout } from "./settings-layout";

function mount(
  path: "/settings/categories" | "/settings/tags" | "/settings/files",
) {
  navigation.path = path;
  const container = document.createElement("div");
  document.body.appendChild(container);
  render(
    <SettingsLayout>
      <h1>
        {path === "/settings/categories"
          ? "カテゴリー"
          : path === "/settings/tags"
            ? "タグ"
            : "ファイル"}
      </h1>
    </SettingsLayout>,
    container,
  );
}

afterEach(() => {
  navigation.path = "/";
  document.body.replaceChildren();
});

describe("設定レイアウト", () => {
  it("設定メニューをURLリンクとして表示し現在地を示す", async () => {
    mount("/settings/categories");

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
  });

  it("タグ設定ではタグの現在地を示す", async () => {
    mount("/settings/tags");

    await expect
      .element(page.getByRole("link", { name: "タグ" }))
      .toHaveAttribute("aria-current", "page");
  });

  it("ファイル設定ではファイルの現在地を示す", async () => {
    mount("/settings/files");

    await expect
      .element(page.getByRole("link", { name: "ファイル" }))
      .toHaveAttribute("aria-current", "page");
  });

  it("設定内の遷移でモバイルメニューを閉じる", async () => {
    mount("/settings/categories");
    const drawer = document.querySelector<HTMLInputElement>("#settings-drawer");
    if (!drawer) throw new Error("settings drawer is missing");
    drawer.checked = true;

    await page.getByRole("link", { name: "タグ" }).click();

    expect(drawer.checked).toBe(false);
  });
});
