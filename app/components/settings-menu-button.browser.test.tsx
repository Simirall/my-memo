import { afterEach, describe, expect, it } from "vitest";
import { render } from "@/tests/browser/render";
import { navigation } from "../../tests/setup/navigation";
import SettingsMenuButton from "./settings-menu-button";

afterEach(() => {
  navigation.path = "/";
  document.body.replaceChildren();
});

describe("設定メニューボタン", () => {
  it("設定ページだけでドロワーの開閉ラベルを表示する", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);

    navigation.path = "/settings/account";
    render(<SettingsMenuButton />, container);
    expect(
      document.querySelector('label[aria-label="設定メニューを開く"]'),
    ).not.toBeNull();

    navigation.path = "/";
    render(<SettingsMenuButton />, container);
    expect(
      document.querySelector('label[aria-label="設定メニューを開く"]'),
    ).toBeNull();
  });
});
