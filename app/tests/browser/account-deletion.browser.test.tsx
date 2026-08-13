/** @jsxImportSource hono/jsx/dom */
import { render } from "hono/jsx/dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import AccountDeletion from "@/islands/$account-deletion";
import AccountDeletionComplete from "@/islands/$account-deletion-complete";

const mount = (initialStatus: "processing" | "failed" | null = null) => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  render(<AccountDeletion initialStatus={initialStatus} />, container);
};

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  history.replaceState(null, "", "/");
});

describe("退会完了通知", () => {
  it("ログイン画面のトーストとして一度だけ表示して閉じられる", async () => {
    history.replaceState(null, "", "/login?accountDeleted=1");
    const container = document.createElement("div");
    document.body.appendChild(container);
    render(<AccountDeletionComplete />, container);

    await expect
      .element(page.getByRole("status"))
      .toHaveTextContent("退会が完了しました。");
    await expect.poll(() => location.pathname + location.search).toBe("/login");
    await page.getByRole("button", { name: "退会完了通知を閉じる" }).click();

    await expect.element(page.getByRole("status")).not.toBeInTheDocument();
  });
});

describe("退会画面", () => {
  it("確認をキャンセルすると退会処理を開始しない", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    mount();

    await page.getByRole("button", { name: "退会する" }).click();
    const dialog = page.getByRole("dialog", { name: "退会の確認" });
    await expect.element(dialog).toBeVisible();
    await expect
      .element(dialog.getByRole("button", { name: "キャンセル", exact: true }))
      .toHaveFocus();
    await dialog
      .getByRole("button", { name: "キャンセル", exact: true })
      .click();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("確認後は二重送信を防いで処理中表示へ切り替える", async () => {
    let resolveRequest: ((response: Response) => void) | undefined;
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveRequest = resolve;
          }),
      )
      .mockResolvedValue(
        new Response(
          JSON.stringify({ status: "failed", message: "再試行してください。" }),
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    mount();

    await page.getByRole("button", { name: "退会する" }).click();
    await page
      .getByRole("dialog", { name: "退会の確認" })
      .getByRole("button", { name: "退会する" })
      .click();
    await expect
      .element(page.getByRole("button", { name: "退会する" }))
      .toBeDisabled();
    resolveRequest?.(
      new Response(JSON.stringify({ status: "processing" }), { status: 202 }),
    );

    await expect.element(page.getByText("退会処理中")).toBeVisible();
    expect(
      fetchMock.mock.calls.filter(([, options]) => options?.method === "POST"),
    ).toHaveLength(1);
  });

  it("削除停止時だけ再試行できる", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ status: "processing" })),
      );
    vi.stubGlobal("fetch", fetchMock);
    mount("failed");

    await expect
      .element(page.getByText("ファイルの削除が停止しました。"))
      .toBeVisible();
    await page.getByRole("button", { name: "削除を再試行" }).click();

    expect(fetchMock).toHaveBeenCalledWith("/api/account-deletion/retry", {
      method: "POST",
    });
    await expect
      .element(page.getByText("すべてのデータを削除しています。"))
      .toBeVisible();
  });
});
