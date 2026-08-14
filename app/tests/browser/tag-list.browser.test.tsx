/** @jsxImportSource hono/jsx/dom */
import { render } from "hono/jsx/dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { TagList } from "@/islands/$tag-list";

const tags = [
  { id: "work", name: "仕事" },
  { id: "private", name: "個人" },
];

const mount = () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  render(<TagList initialTags={tags} />, container);
};

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("タグ名の変更", () => {
  it("削除ボタンの左に編集ボタンを置き、現在名を選択して開く", async () => {
    mount();

    const editButton = page.getByRole("button", { name: "タグ「仕事」を編集" });
    const editElement = await editButton.element();
    expect(editElement.nextElementSibling?.tagName).toBe("FORM");

    await userEvent.click(editButton);
    await expect
      .element(page.getByRole("dialog", { name: "タグ名を変更" }))
      .toBeVisible();
    const input = page.getByRole("textbox", { name: "タグ名" });
    await expect.element(input).toHaveValue("仕事");
    await expect.element(input).toHaveFocus();
  });

  it("キャンセル・Escape・背景クリックで閉じてフォーカスを戻す", async () => {
    mount();
    const editButton = page.getByRole("button", { name: "タグ「仕事」を編集" });
    const dialogIsOpen = () =>
      document.querySelector<HTMLDialogElement>("dialog")?.open;

    await userEvent.click(editButton);
    await userEvent.click(
      page.getByRole("button", { name: "キャンセル", exact: true }),
    );
    await expect.poll(dialogIsOpen).toBe(false);
    await expect.element(editButton).toHaveFocus();

    await userEvent.click(editButton);
    await userEvent.keyboard("{Escape}");
    await expect.poll(dialogIsOpen).toBe(false);
    await expect.element(editButton).toHaveFocus();

    await userEvent.click(editButton);
    await userEvent.click(
      page.getByRole("button", { name: "タグ名の変更をキャンセル" }),
    );
    await expect.poll(dialogIsOpen).toBe(false);
    await expect.element(editButton).toHaveFocus();
  });

  it("保存中は操作を無効にし、成功時は一覧を再ソートして通知する", async () => {
    let resolveFetch: (response: Response) => void = () => undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            resolveFetch = resolve;
          }),
      ),
    );
    mount();

    await userEvent.click(
      page.getByRole("button", { name: "タグ「仕事」を編集" }),
    );
    await page.getByRole("textbox", { name: "タグ名" }).fill("  あとで  ");
    const saveButton = page.getByRole("button", { name: "保存" });
    const saveElement = (await saveButton.element()) as HTMLButtonElement;
    await userEvent.click(saveButton);

    await expect.poll(() => saveElement.disabled).toBe(true);
    expect(
      document.querySelector<HTMLButtonElement>(
        'dialog[aria-label="タグ名を変更"] button[type="button"]',
      )?.disabled,
    ).toBe(true);

    resolveFetch(
      new Response(JSON.stringify({ ok: true, name: "あとで" }), {
        status: 200,
      }),
    );
    await expect
      .element(page.getByText("タグ名を変更しました。"))
      .toBeVisible();
    const names = [...document.querySelectorAll("li > span")].map(
      (element) => element.textContent,
    );
    expect(names).toEqual(["#あとで", "#個人"]);
  });

  it("保存失敗時はモーダルと入力値を保持して再送信できる", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            message: "同じ名前のタグがすでに登録されています。",
          }),
          { status: 409 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, name: "更新後" }), {
          status: 200,
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    mount();

    await userEvent.click(
      page.getByRole("button", { name: "タグ「仕事」を編集" }),
    );
    const input = page.getByRole("textbox", { name: "タグ名" });
    await input.fill("個人");
    await userEvent.click(page.getByRole("button", { name: "保存" }));

    await expect
      .element(page.getByRole("alert"))
      .toHaveTextContent("同じ名前のタグがすでに登録されています。");
    await expect.element(input).toHaveValue("個人");

    await input.fill("更新後");
    await userEvent.click(page.getByRole("button", { name: "保存" }));
    await expect.element(page.getByText("#更新後")).toBeVisible();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
