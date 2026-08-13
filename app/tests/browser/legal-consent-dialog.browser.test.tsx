/** @jsxImportSource hono/jsx/dom */

import { render } from "hono/jsx/dom";
import { afterEach, describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import {
  LEGAL_CONSENT_STORAGE_KEY,
  LEGAL_EFFECTIVE_AT,
} from "@/features/legal/consent";
import LegalConsentDialog from "@/islands/$legal-consent-dialog";

function mount(acceptedAt?: string) {
  if (acceptedAt) {
    window.localStorage.setItem(LEGAL_CONSENT_STORAGE_KEY, acceptedAt);
  }
  const container = document.createElement("div");
  document.body.appendChild(container);
  render(<LegalConsentDialog />, container);
}

afterEach(() => {
  for (const dialog of document.querySelectorAll("dialog")) dialog.close();
  document.body.replaceChildren();
  window.localStorage.clear();
});

describe("改定後の利用規約再同意", () => {
  it("現行規約への同意があればダイアログを開かない", async () => {
    mount(LEGAL_EFFECTIVE_AT);

    const element = document.querySelector("dialog") as HTMLDialogElement;
    await expect.poll(() => element.open).toBe(false);
  });

  it("改定前の同意では確認を閉じさせず、同意時だけ日時を更新する", async () => {
    mount("2026-08-12T23:59:59+09:00");
    const element = document.querySelector("dialog") as HTMLDialogElement;
    await expect.poll(() => element.open).toBe(true);
    const dialog = page.getByRole("dialog", {
      name: "利用規約・プライバシーポリシーが改訂されました",
    });

    await expect
      .element(dialog.getByRole("link", { name: "利用規約" }))
      .toHaveAttribute("href", "/terms");
    await expect
      .element(dialog.getByRole("link", { name: "プライバシーポリシー" }))
      .toHaveAttribute("href", "/privacy");
    await expect
      .element(dialog.getByRole("button", { name: "ログアウト" }))
      .toBeVisible();

    await userEvent.keyboard("{Escape}");
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(element.open).toBe(true);

    await dialog.getByRole("button", { name: "同意して続ける" }).click();

    expect(element.open).toBe(false);
    expect(
      Date.parse(
        window.localStorage.getItem(LEGAL_CONSENT_STORAGE_KEY) ?? "invalid",
      ),
    ).toBeGreaterThanOrEqual(Date.parse(LEGAL_EFFECTIVE_AT));
  });
});
