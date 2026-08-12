/** @jsxImportSource hono/jsx/dom */

import { useState } from "hono/jsx";
import { render } from "hono/jsx/dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { ConfirmDialog } from "@/components/confirm-dialog";

const mount = (onConfirm = vi.fn()) => {
  const container = document.createElement("div");
  document.body.appendChild(container);

  const Example = () => {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button onClick={() => setOpen(true)} type="button">
          開く
        </button>
        <ConfirmDialog
          confirmLabel="削除"
          description={open ? "「テスト」を削除しますか？" : ""}
          destructive
          onCancel={() => setOpen(false)}
          onConfirm={() => {
            setOpen(false);
            onConfirm();
          }}
          open={open}
          title="削除の確認"
        />
      </>
    );
  };

  render(<Example />, container);
};

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("共通確認モーダル", () => {
  it("内容と危険操作を表示し、キャンセルへ初期フォーカスを置く", async () => {
    mount();
    await page.getByRole("button", { name: "開く" }).click();

    const dialog = page.getByRole("dialog", { name: "削除の確認" });
    await expect.element(dialog).toBeVisible();
    await expect
      .element(page.getByText("「テスト」を削除しますか？"))
      .toBeVisible();
    await expect
      .element(dialog.getByRole("button", { name: "キャンセル", exact: true }))
      .toHaveFocus();
  });

  it("キャンセル後はモーダルを閉じて起点へフォーカスを戻す", async () => {
    mount();
    const opener = page.getByRole("button", { name: "開く" });
    await opener.click();
    const dialog = page.getByRole("dialog", { name: "削除の確認" });
    const dialogElement = dialog.element() as HTMLDialogElement;
    await dialog
      .getByRole("button", { name: "キャンセル", exact: true })
      .click();

    expect(dialogElement.open).toBe(false);
    expect(dialogElement.querySelector("p")?.textContent).toContain(
      "「テスト」を削除しますか？",
    );
    await expect.poll(() => document.activeElement).toBe(opener.element());
  });

  it("確定時だけコールバックを実行する", async () => {
    const onConfirm = vi.fn();
    mount(onConfirm);
    await page.getByRole("button", { name: "開く" }).click();
    const dialog = page.getByRole("dialog", { name: "削除の確認" });
    const dialogElement = dialog.element() as HTMLDialogElement;
    await dialog.getByRole("button", { name: "削除", exact: true }).click();

    expect(onConfirm).toHaveBeenCalledOnce();
    expect(dialogElement.open).toBe(false);
  });

  it("Escキーをキャンセルとして扱う", async () => {
    mount();
    await page.getByRole("button", { name: "開く" }).click();
    const dialogElement = page
      .getByRole("dialog", { name: "削除の確認" })
      .element() as HTMLDialogElement;
    await userEvent.keyboard("{Escape}");
    await new Promise((resolve) => requestAnimationFrame(resolve));

    expect(dialogElement.open).toBe(false);
  });

  it("背景クリックをキャンセルとして扱う", async () => {
    mount();
    await page.getByRole("button", { name: "開く" }).click();
    const dialogElement = page
      .getByRole("dialog", { name: "削除の確認" })
      .element() as HTMLDialogElement;
    await page.getByRole("button", { name: "削除の確認をキャンセル" }).click();

    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(dialogElement.open).toBe(false);
  });
});
