/** @jsxImportSource hono/jsx/dom */

import { render } from "hono/jsx/dom";
import { afterEach, describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import {
  LEGAL_CONSENT_STORAGE_KEY,
  LEGAL_EFFECTIVE_AT,
} from "@/features/legal/consent";
import { LoginButton } from "./-components/$login-button";

const consentLabel = "利用規約に同意し、プライバシーポリシーを確認しました";

function mount() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  render(<LoginButton callbackURL="/share/consume" />, container);
}

afterEach(() => {
  document.body.replaceChildren();
  window.localStorage.clear();
});

describe("ログイン前の利用規約同意", () => {
  it.each([
    ["保存値なし", null],
    ["不正な保存値", "invalid"],
    ["改定前の保存値", "2026-08-12T23:59:59+09:00"],
  ])("%sではログインを無効にする", async (_name, acceptedAt) => {
    if (acceptedAt) {
      window.localStorage.setItem(LEGAL_CONSENT_STORAGE_KEY, acceptedAt);
    }
    mount();

    await expect
      .element(page.getByRole("checkbox", { name: consentLabel }))
      .not.toBeChecked();
    await expect
      .element(page.getByRole("button", { name: "GitHubでログイン" }))
      .toBeDisabled();
  });

  it("現行規約への同意があれば初期状態でログインできる", async () => {
    window.localStorage.setItem(LEGAL_CONSENT_STORAGE_KEY, LEGAL_EFFECTIVE_AT);
    mount();

    await expect
      .element(page.getByRole("checkbox", { name: consentLabel }))
      .toBeChecked();
    await expect
      .element(page.getByRole("button", { name: "GitHubでログイン" }))
      .toBeEnabled();
  });

  it("チェック時に同意日時を保存しログインを有効にする", async () => {
    mount();

    await page.getByRole("checkbox", { name: consentLabel }).click();

    await expect
      .element(page.getByRole("button", { name: "GitHubでログイン" }))
      .toBeEnabled();
    expect(
      Date.parse(
        window.localStorage.getItem(LEGAL_CONSENT_STORAGE_KEY) ?? "invalid",
      ),
    ).toBeGreaterThanOrEqual(Date.parse(LEGAL_EFFECTIVE_AT));
  });

  it("規約文書を別タブで開ける", async () => {
    mount();

    await expect
      .element(page.getByRole("link", { name: "利用規約" }))
      .toHaveAttribute("href", "/terms");
    await expect
      .element(page.getByRole("link", { name: "利用規約" }))
      .toHaveAttribute("target", "_blank");
    await expect
      .element(page.getByRole("link", { name: "プライバシーポリシー" }))
      .toHaveAttribute("href", "/privacy");
  });
});
