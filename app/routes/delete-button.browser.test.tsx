/** @jsxImportSource hono/jsx/dom */
import { render } from "hono/jsx/dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { DeleteButton } from "@/islands/$delete-button";

afterEach(() => {
  document.body.replaceChildren();
});

describe("共通削除ボタン", () => {
  it("キャンセル時は送信せず、確定時だけ送信状態にする", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    render(
      <DeleteButton
        action="/api/items/delete/item-1"
        confirmMessage="「項目」を削除しますか？"
        label="項目を削除"
      />,
      container,
    );
    const form = document.querySelector<HTMLFormElement>("form[action]");
    const requestSubmitSpy = vi.spyOn(form as HTMLFormElement, "requestSubmit");
    form?.addEventListener("submit", (event) => {
      event.preventDefault();
    });

    await page.getByRole("button", { name: "項目を削除" }).click();
    await page
      .getByRole("dialog", { name: "削除の確認" })
      .getByRole("button", { name: "キャンセル", exact: true })
      .click();
    expect(requestSubmitSpy).not.toHaveBeenCalled();

    await page.getByRole("button", { name: "項目を削除" }).click();
    await page
      .getByRole("dialog", { name: "削除の確認" })
      .getByRole("button", { name: "削除", exact: true })
      .click();

    expect(requestSubmitSpy).toHaveBeenCalledOnce();
    await expect
      .element(page.getByRole("button", { name: "項目を削除" }))
      .toBeDisabled();
  });
});
