/** @jsxImportSource hono/jsx/dom */
import { render } from "hono/jsx/dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import CreateMemoForm from "../../app/islands/memos/create-memo-form";
import UrlSummaryForm from "../../app/islands/memos/url-summary-form";

function mount(node: Parameters<typeof render>[0]) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  render(node, container);
}

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("メモ作成フォーム", () => {
  it("メモ件数の上限到達時に入力内容を保持してエラーを通知する", async () => {
    vi.spyOn(window, "fetch").mockResolvedValue(
      Response.json(
        { code: "QUOTA_EXCEEDED", message: "メモの上限（100件）です。" },
        { status: 403 },
      ),
    );
    mount(<CreateMemoForm categories={[]} />);

    const title = page.getByLabelText("Title");
    const content = page.getByLabelText("Content");
    await title.fill("残してほしいタイトル");
    await content.fill("残してほしい本文");
    await page.getByRole("button", { name: "Create Memo" }).click();

    await expect
      .element(page.getByRole("alert"))
      .toHaveTextContent("メモの上限（100件）です。");
    await expect.element(title).toHaveValue("残してほしいタイトル");
    await expect.element(content).toHaveValue("残してほしい本文");
  });

  it("メモ作成の送信中はボタンを無効にして二重送信を防ぐ", async () => {
    let resolveResponse: ((response: Response) => void) | undefined;
    vi.spyOn(window, "fetch").mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveResponse = resolve;
        }),
    );
    mount(<CreateMemoForm categories={[]} />);

    await page.getByLabelText("Title").fill("title");
    await page.getByLabelText("Content").fill("content");
    await page.getByRole("button", { name: "Create Memo" }).click();
    await expect.element(page.getByRole("button")).toBeDisabled();

    resolveResponse?.(
      Response.json({ message: "失敗しました。" }, { status: 500 }),
    );
    await expect
      .element(page.getByRole("alert"))
      .toHaveTextContent("失敗しました。");
  });

  it("AI要約の月次上限到達時にURLを保持してエラーを通知する", async () => {
    vi.spyOn(window, "fetch").mockResolvedValue(
      Response.json(
        { code: "QUOTA_EXCEEDED", message: "AI要約の今月の上限です。" },
        { status: 403 },
      ),
    );
    mount(<UrlSummaryForm categories={[]} />);

    const url = page.getByLabelText("URL");
    await url.fill("https://example.com/article");
    await page.getByRole("button", { name: "Summarize Page" }).click();

    await expect
      .element(page.getByRole("alert"))
      .toHaveTextContent("AI要約の今月の上限です。");
    await expect.element(url).toHaveValue("https://example.com/article");
  });
});
