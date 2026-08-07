/** @jsxImportSource hono/jsx/dom */
import { render } from "hono/jsx/dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { SHARE_STORAGE_KEY } from "@/routes/-features/sharing";
import ShareConsumer, {
  type ShareQuota,
} from "@/routes/share/consume/-components/$share-consumer";

function mount(quota: ShareQuota | null) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  render(<ShareConsumer quota={quota} />, container);
}

const availableQuota: ShareQuota = {
  memo: { used: 2, limit: 100 },
  aiSummary: { used: 1, limit: 10 },
};

function prepareUrlShare() {
  window.history.replaceState({}, "", "/share/consume");
  window.sessionStorage.setItem(
    SHARE_STORAGE_KEY,
    JSON.stringify({
      title: "ページタイトル",
      text: "",
      url: "https://example.com/article",
      receivedAt: Date.now(),
    }),
  );
}

afterEach(() => {
  document.body.replaceChildren();
  window.history.replaceState({}, "", "/");
  window.sessionStorage.removeItem(SHARE_STORAGE_KEY);
  vi.restoreAllMocks();
});

describe("共有URLの保存方法選択", () => {
  it("共有URLと残りクォータ、2つの保存方法を表示する", async () => {
    prepareUrlShare();
    mount(availableQuota);

    await expect
      .element(
        page.getByRole("heading", { name: "このURLをどう保存しますか？" }),
      )
      .toBeVisible();
    await expect
      .element(page.getByText("example.com", { exact: true }))
      .toBeVisible();
    await expect.element(page.getByText("今月あと9回")).toBeVisible();
    await expect
      .element(page.getByRole("button", { name: "AIで要約" }))
      .not.toBeDisabled();
    await expect
      .element(page.getByRole("button", { name: "メモを作成" }))
      .not.toBeDisabled();
  });

  it("AI要約クォータ切れではAI要約だけを無効にする", async () => {
    prepareUrlShare();
    mount({
      memo: { used: 2, limit: 100 },
      aiSummary: { used: 10, limit: 10 },
    });

    await expect.element(page.getByText("今月あと0回")).toBeVisible();
    await expect
      .element(page.getByRole("button", { name: "AIで要約" }))
      .toBeDisabled();
    await expect
      .element(page.getByRole("button", { name: "メモを作成" }))
      .not.toBeDisabled();
  });

  it("AI要約クォータが無制限なら無制限と表示する", async () => {
    prepareUrlShare();
    mount({
      memo: { used: 2, limit: 100 },
      aiSummary: { used: 1, limit: null },
    });

    await expect.element(page.getByText("無制限")).toBeVisible();
  });

  it("メモ上限到達時は2つの保存方法を無効にする", async () => {
    prepareUrlShare();
    mount({
      memo: { used: 100, limit: 100 },
      aiSummary: { used: 1, limit: 10 },
    });

    await expect
      .element(page.getByRole("alert"))
      .toHaveTextContent("メモの上限に達しているため");
    await expect
      .element(page.getByRole("button", { name: "AIで要約" }))
      .toBeDisabled();
    await expect
      .element(page.getByRole("button", { name: "メモを作成" }))
      .toBeDisabled();
  });

  it("プラン設定を取得できない場合は2つの保存方法を無効にする", async () => {
    prepareUrlShare();
    mount(null);

    await expect
      .element(page.getByRole("alert"))
      .toHaveTextContent("プランの上限設定を確認できないため");
    await expect
      .element(page.getByRole("button", { name: "AIで要約" }))
      .toBeDisabled();
    await expect
      .element(page.getByRole("button", { name: "メモを作成" }))
      .toBeDisabled();
  });
});
