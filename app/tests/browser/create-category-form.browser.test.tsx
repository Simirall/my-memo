/** @jsxImportSource hono/jsx/dom */
import { render } from "hono/jsx/dom";
import { afterEach, describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { CreateCategoryForm } from "@/routes/settings/categories/-components/$create-category-form";

const mount = (props: { created?: boolean; error?: string }) => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  render(<CreateCategoryForm {...props} />, container);
};

afterEach(() => {
  document.body.replaceChildren();
  history.replaceState(null, "", "/");
});

describe("カテゴリー作成フォーム", () => {
  it("重複エラーを通知し、入力欄から修正できるようにする", async () => {
    mount({ error: "同じ名前のカテゴリーがすでに登録されています。" });

    await expect
      .element(page.getByRole("alert"))
      .toHaveTextContent("同じ名前のカテゴリーがすでに登録されています。");
    await expect
      .element(page.getByLabelText("カテゴリー名"))
      .toHaveAttribute(
        "aria-describedby",
        "category-name-help category-name-error",
      );
    await expect
      .element(page.getByRole("button", { name: "追加" }))
      .toBeEnabled();
  });

  it("追加完了をトーストで一度だけ通知して自動で閉じる", async () => {
    history.replaceState(null, "", "/settings/categories?created=1");
    mount({ created: true });

    await expect
      .element(page.getByRole("status"))
      .toHaveTextContent("カテゴリーを追加しました。");
    await expect
      .poll(() => location.pathname + location.search)
      .toBe("/settings/categories");
    await expect
      .element(
        page.getByRole("button", { name: "カテゴリー追加完了通知を閉じる" }),
      )
      .not.toBeInTheDocument();

    await expect.element(page.getByRole("status")).not.toBeInTheDocument();
  });
});
