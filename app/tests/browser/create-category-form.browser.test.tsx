/** @jsxImportSource hono/jsx/dom */
import { render } from "hono/jsx/dom";
import { afterEach, describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { CreateCategoryForm } from "@/routes/settings/categories/-components/$create-category-form";

const mount = () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  render(
    <CreateCategoryForm error="同じ名前のカテゴリーがすでに登録されています。" />,
    container,
  );
};

afterEach(() => {
  document.body.replaceChildren();
});

describe("カテゴリー作成フォーム", () => {
  it("重複エラーを通知し、入力欄から修正できるようにする", async () => {
    mount();

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
});
