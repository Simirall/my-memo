import { afterEach, describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { DeleteButton } from "@/islands/$delete-button";
import MemoListViewController from "@/islands/$memo-list-view-controller";
import { render } from "@/tests/browser/render";

const mount = (listPath: string) => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  render(
    <MemoListViewController
      cards={[
        {
          id: "memo-1",
          content: (
            <article data-memo-card="memo-1">
              カード本文
              <DeleteButton
                action="/api/memos/delete/memo-1"
                confirmMessage="メモを削除しますか？"
              />
            </article>
          ),
        },
      ]}
      controls={null}
      listPath={listPath}
      table={
        <div data-memo-list-view="list">
          <button data-memo-detail="memo-1" type="button">
            詳細を開く
          </button>
        </div>
      }
    />,
    container,
  );
  return container;
};

afterEach(() => {
  document.body.replaceChildren();
  localStorage.clear();
});

describe("メモ一覧の表示切り替え", () => {
  it("一覧パスごとに表示を保存し、再表示時に復元する", async () => {
    mount("/");
    await page
      .getByRole("checkbox", { name: "リストビューに切り替え" })
      .click();
    expect(localStorage.getItem("my-memo.memo-list-view:/")).toBe("list");
    expect(
      document.querySelector<HTMLElement>('[data-memo-list-view="list"]')
        ?.hidden,
    ).toBe(false);

    document.body.replaceChildren();
    mount("/categories/category-1");
    await expect
      .element(page.getByRole("checkbox", { name: "リストビューに切り替え" }))
      .not.toBeChecked();

    document.body.replaceChildren();
    mount("/");
    await expect
      .element(page.getByRole("checkbox", { name: "カードビューに切り替え" }))
      .toBeChecked();
  });

  it("詳細を表示し、閉じるとボタンへフォーカスする", async () => {
    localStorage.setItem("my-memo.memo-list-view:/", "list");
    mount("/");
    const trigger = page.getByRole("button", { name: "詳細を開く" });
    await trigger.click();
    const dialog = document.querySelector<HTMLDialogElement>("dialog");
    expect(dialog?.open).toBe(true);
    expect(dialog?.querySelector("[data-memo-card]")?.textContent).toContain(
      "カード本文",
    );

    dialog?.close();
    await new Promise((resolve) => window.setTimeout(resolve, 100));
    expect(document.activeElement).toBe(
      document.querySelector('[data-memo-detail="memo-1"]'),
    );
  });

  it("詳細内の削除確認を閉じてもメモ詳細を保持する", async () => {
    localStorage.setItem("my-memo.memo-list-view:/", "list");
    mount("/");
    await page.getByRole("button", { name: "詳細を開く" }).click();
    const detail = page.getByRole("dialog", { name: "メモ詳細", exact: true });
    await detail.getByRole("button", { name: "削除", exact: true }).click();
    await page
      .getByRole("dialog", { name: "削除の確認" })
      .getByRole("button", { name: "キャンセル", exact: true })
      .click();
    await expect.element(detail).toBeVisible();
    await expect
      .element(detail.getByRole("button", { name: "削除", exact: true }))
      .toHaveFocus();
  });
});
