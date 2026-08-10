/** @jsxImportSource hono/jsx/dom */
import { render } from "hono/jsx/dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import InstallPrompt from "@/islands/$install-prompt";

function mount(mode: "banner" | "settings" = "banner") {
  const container = document.createElement("div");
  document.body.appendChild(container);
  render(<InstallPrompt mode={mode} />, container);
}

afterEach(() => {
  document.body.replaceChildren();
  window.localStorage.clear();
  window.__myMemoInstallPrompt = undefined;
  vi.restoreAllMocks();
});

describe("PWAインストール案内", () => {
  it("初回は案内を表示し、閉じると保存する", async () => {
    mount();

    await expect
      .element(page.getByText("My Memoをアプリとして使う"))
      .toBeVisible();
    await page
      .getByRole("button", { name: "インストール案内を閉じる" })
      .click();

    await expect
      .element(page.getByText("My Memoをアプリとして使う"))
      .not.toBeInTheDocument();
    expect(
      window.localStorage.getItem("my-memo.install-prompt-dismissed"),
    ).toBe("1");
  });

  it("beforeinstallpromptがあればインストール処理を呼び出す", async () => {
    const prompt = vi.fn().mockResolvedValue(undefined);
    window.__myMemoInstallPrompt = {
      prompt,
      userChoice: Promise.resolve({ outcome: "accepted" as const }),
    } as unknown as NonNullable<typeof window.__myMemoInstallPrompt>;
    mount();
    window.dispatchEvent(new Event("my-memo-install-ready"));

    await page.getByRole("button", { name: "アプリをインストール" }).click();

    expect(prompt).toHaveBeenCalledOnce();
    await expect
      .element(page.getByText("My Memoをアプリとして使う"))
      .not.toBeInTheDocument();
  });

  it("設定画面では閉じた状態でも常設案内を表示する", async () => {
    window.localStorage.setItem("my-memo.install-prompt-dismissed", "1");
    mount("settings");

    await expect
      .element(page.getByText("My Memoをアプリとして使う"))
      .toBeVisible();
  });
});
