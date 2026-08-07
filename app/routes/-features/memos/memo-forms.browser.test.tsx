/** @jsxImportSource hono/jsx/dom */
import { render } from "hono/jsx/dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import AttachmentManager from "@/routes/-features/memos/$attachment-manager";
import { SHARE_STORAGE_KEY } from "@/routes/-features/sharing";
import CreateMemoForm from "@/routes/memos/create/-components/$create-memo-form";
import UrlSummaryForm from "@/routes/memos/url-summary/-components/$url-summary-form";

function mount(node: Parameters<typeof render>[0]) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  render(node, container);
}

afterEach(() => {
  document.body.replaceChildren();
  window.history.replaceState({}, "", "/");
  window.sessionStorage.removeItem(SHARE_STORAGE_KEY);
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
    await expect
      .element(page.getByRole("button", { name: "Create Memo" }))
      .toBeDisabled();

    resolveResponse?.(
      Response.json({ message: "失敗しました。" }, { status: 500 }),
    );
    await expect
      .element(page.getByRole("alert"))
      .toHaveTextContent("失敗しました。");
  });

  it("共有テキストを通常メモの初期値へ復元して一時データを消費する", async () => {
    window.history.replaceState({}, "", "/memos/create?shared=1");
    window.sessionStorage.setItem(
      SHARE_STORAGE_KEY,
      JSON.stringify({
        title: "共有タイトル",
        text: "共有本文\nhttps://example.com/article",
        url: "",
        receivedAt: Date.now(),
      }),
    );
    mount(<CreateMemoForm categories={[]} />);

    await expect
      .element(page.getByLabelText("Title"))
      .toHaveValue("共有タイトル");
    await expect
      .element(page.getByLabelText("Content"))
      .toHaveValue("共有本文\nhttps://example.com/article");
    await expect
      .element(page.getByLabelText("URL (optional)"))
      .toHaveValue("https://example.com/article");
    expect(window.sessionStorage.getItem(SHARE_STORAGE_KEY)).toBeNull();
  });

  it("共有URLを通常メモの初期値へ復元して一時データを消費する", async () => {
    window.history.replaceState({}, "", "/memos/create?shared=1");
    window.sessionStorage.setItem(
      SHARE_STORAGE_KEY,
      JSON.stringify({
        title: "ページタイトル",
        text: "",
        url: "https://example.com/article",
        receivedAt: Date.now(),
      }),
    );
    mount(<CreateMemoForm categories={[]} />);

    await expect
      .element(page.getByLabelText("Title"))
      .toHaveValue("ページタイトル");
    await expect.element(page.getByLabelText("Content")).toHaveValue("");
    await expect
      .element(page.getByLabelText("URL (optional)"))
      .toHaveValue("https://example.com/article");
    expect(window.sessionStorage.getItem(SHARE_STORAGE_KEY)).toBeNull();
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

  it("AI要約の部分応答を画面に表示してストリームエラーを通知する", async () => {
    const encoder = new TextEncoder();
    const events = [
      'event: status\ndata: {"message":"要約を生成しています…"}\n\n',
      'event: chunk\ndata: {"text":"概要"}\n\n',
      'event: chunk\ndata: {"text":"\\n- 要点"}\n\n',
      'event: error\ndata: {"message":"AI要約に失敗しました。"}\n\n',
    ];
    vi.spyOn(window, "fetch").mockResolvedValue(
      new Response(
        new ReadableStream({
          start(controller) {
            for (const event of events)
              controller.enqueue(encoder.encode(event));
            controller.close();
          },
        }),
        { headers: { "Content-Type": "text/event-stream" } },
      ),
    );
    mount(<UrlSummaryForm categories={[]} />);

    await page.getByLabelText("URL").fill("https://example.com/article");
    await page.getByRole("button", { name: "Summarize Page" }).click();

    await expect.element(page.getByText("概要\n- 要点")).toBeVisible();
    await expect
      .element(page.getByRole("alert"))
      .toHaveTextContent("AI要約に失敗しました。");
  });

  it("共有URLをAI要約フォームの初期値へ復元して一時データを消費する", async () => {
    window.history.replaceState({}, "", "/memos/url-summary?shared=1");
    window.sessionStorage.setItem(
      SHARE_STORAGE_KEY,
      JSON.stringify({
        title: "ページタイトル",
        text: "",
        url: "https://example.com/article",
        receivedAt: Date.now(),
      }),
    );
    mount(<UrlSummaryForm categories={[]} />);

    await expect
      .element(page.getByLabelText("URL"))
      .toHaveValue("https://example.com/article");
    expect(window.sessionStorage.getItem(SHARE_STORAGE_KEY)).toBeNull();
  });
});

describe("添付ファイル管理", () => {
  it("添付保存後にファイル選択を解除して成功通知を自動で消す", async () => {
    vi.spyOn(window, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url === "/api/attachments/quota") {
        return Response.json({
          used: 0,
          limit: 524_288_000,
          remaining: 524_288_000,
          maxFileBytes: 26_214_400,
          maxFilesPerMemo: 5,
        });
      }
      return Response.json({
        attachment: {
          id: "attachment-1",
          memoId: "memo-1",
          userId: "user-1",
          r2Key: "user-1/memo-1/attachment-1",
          fileName: "sample.mp3",
          contentType: "audio/mpeg",
          sizeBytes: 3,
          etag: "etag-1",
          createdAt: new Date().toISOString(),
        },
        quota: {
          used: 3,
          limit: 524_288_000,
          remaining: 524_287_997,
          maxFileBytes: 26_214_400,
          maxFilesPerMemo: 5,
        },
      });
    });
    mount(
      <AttachmentManager
        initialAttachments={[
          {
            id: "audio-1",
            memoId: "memo-1",
            userId: "user-1",
            r2Key: "user-1/memo-1/audio-1",
            fileName: "sample.mp3",
            contentType: "audio/mpeg",
            sizeBytes: 3,
            etag: "etag-audio",
            createdAt: new Date().toISOString(),
          },
          {
            id: "video-1",
            memoId: "memo-1",
            userId: "user-1",
            r2Key: "user-1/memo-1/video-1",
            fileName: "sample.mp4",
            contentType: "video/mp4",
            sizeBytes: 3,
            etag: "etag-video",
            createdAt: new Date().toISOString(),
          },
        ]}
        memoId="memo-1"
      />,
    );
    expect(
      Array.from(
        document.querySelectorAll<HTMLMediaElement>("audio, video"),
      ).map((media) => media.volume),
    ).toEqual([0.25, 0.25]);

    const input =
      document.querySelector<HTMLInputElement>('input[type="file"]');
    expect(input).not.toBeNull();
    const transfer = new DataTransfer();
    transfer.items.add(new File(["abc"], "sample.mp3", { type: "audio/mpeg" }));
    if (input) {
      input.files = transfer.files;
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }

    await expect
      .element(page.getByRole("button", { name: "添付を保存" }))
      .toBeEnabled();
    await page.getByRole("button", { name: "添付を保存" }).click();

    const status = page.getByRole("status");
    await expect.element(status).toHaveTextContent("1件の添付を保存しました。");
    expect(input?.value).toBe("");
    expect(document.querySelector('[role="status"]')).toHaveClass("alert-soft");

    await expect.element(status).not.toBeInTheDocument();
  });
});
