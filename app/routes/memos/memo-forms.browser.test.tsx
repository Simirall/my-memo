/** @jsxImportSource hono/jsx/dom */
import { render } from "hono/jsx/dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import AttachmentManager from "@/features/memos/list/attachments/$attachment-manager";
import { SHARE_STORAGE_KEY } from "@/features/sharing/model/share";
import CreateMemoForm from "@/routes/memos/create/-components/$create-memo-form";
import UrlSummaryForm from "@/routes/memos/url-summary/-components/$url-summary-form";

function mount(node: Parameters<typeof render>[0]) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  render(node, container);
}

function dispatchPaste(
  files: ReadonlyArray<File>,
  text?: string,
  target: EventTarget = document.querySelector("form") ?? window,
): ClipboardEvent {
  const clipboard = new DataTransfer();
  for (const file of files) clipboard.items.add(file);
  if (text !== undefined) clipboard.items.add(text, "text/plain");
  const event = new Event("paste", {
    bubbles: true,
    cancelable: true,
  }) as ClipboardEvent;
  Object.defineProperty(event, "clipboardData", { value: clipboard });
  target.dispatchEvent(event);
  return event;
}

function pressCtrlEnter(target: EventTarget = window) {
  target.dispatchEvent(
    new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
      key: "Enter",
    }),
  );
}

afterEach(() => {
  document.body.replaceChildren();
  window.history.replaceState({}, "", "/");
  window.sessionStorage.removeItem(SHARE_STORAGE_KEY);
  vi.restoreAllMocks();
});

describe("メモ作成フォーム", () => {
  it("フォーム外にフォーカスがあってもCtrl+Enterで送信する", async () => {
    const outsideButton = document.createElement("button");
    document.body.appendChild(outsideButton);
    const fetchSpy = vi
      .spyOn(window, "fetch")
      .mockResolvedValue(Response.json({ message: "確認用" }, { status: 500 }));
    mount(<CreateMemoForm categories={[]} />);

    await page.getByLabelText("タイトル").fill("ショートカット送信");
    outsideButton.focus();
    pressCtrlEnter(outsideButton);

    await expect.poll(() => fetchSpy.mock.calls.length).toBe(1);
  });

  it("本文を任意としてタイトルだけで送信する", async () => {
    const fetchSpy = vi
      .spyOn(window, "fetch")
      .mockResolvedValue(Response.json({ message: "確認用" }, { status: 500 }));
    mount(<CreateMemoForm categories={[]} />);

    const content = page.getByLabelText("本文（任意）");
    await expect.element(content).not.toBeRequired();
    await page.getByLabelText("タイトル").fill("タイトルだけのメモ");
    await page.getByRole("button", { name: "メモを作成" }).click();

    expect(fetchSpy).toHaveBeenCalledOnce();
    const body = fetchSpy.mock.calls[0]?.[1]?.body as FormData;
    expect(body.get("content")).toBe("");
  });

  it("本文欄にMarkdown入力の案内を表示する", async () => {
    mount(<CreateMemoForm categories={[]} />);

    await expect
      .element(page.getByText("Markdownで入力できます。"))
      .toBeVisible();
    expect(
      document.querySelector("#memo-content")?.getAttribute("aria-describedby"),
    ).toBe("memo-content-help");
  });

  it("本文にメディアを貼り付け、テキストの混在時はメディアだけ追加する", async () => {
    vi.spyOn(window, "fetch").mockResolvedValue(
      Response.json({
        used: 0,
        limit: 524_288_000,
        remaining: 524_288_000,
        maxFileBytes: 26_214_400,
        maxFilesPerMemo: 5,
      }),
    );
    mount(<CreateMemoForm categories={[]} />);

    await page.getByLabelText("本文").click();
    const event = dispatchPaste(
      [
        new File(["audio"], "pasted.mp3", { type: "audio/mpeg" }),
        new File(["text"], "pasted.txt", { type: "text/plain" }),
      ],
      "本文には入れない",
    );

    await expect.element(page.getByText("pasted.mp3・5 B")).toBeVisible();
    const status = page.getByRole("status");
    await expect
      .element(status)
      .toHaveTextContent("1件のメディアを追加しました。（非対応形式1件）");
    const statusElement = document.querySelector('[role="status"]');
    const fileInput =
      document.querySelector<HTMLInputElement>("#memo-attachments");
    expect(statusElement?.compareDocumentPosition(fileInput as Node)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(event.defaultPrevented).toBe(true);
    await expect.element(page.getByLabelText("本文")).toHaveValue("");
  });

  it("本文以外にフォーカス中はメディアを貼り付けず、対応メディアがなければ通常貼り付けを妨げない", async () => {
    vi.spyOn(window, "fetch").mockResolvedValue(
      Response.json({
        used: 0,
        limit: 524_288_000,
        remaining: 524_288_000,
        maxFileBytes: 26_214_400,
        maxFilesPerMemo: 5,
      }),
    );
    mount(<CreateMemoForm categories={[]} />);

    await page.getByLabelText("タイトル").click();
    const titlePaste = dispatchPaste([
      new File(["audio"], "title.mp3", { type: "audio/mpeg" }),
    ]);
    expect(titlePaste.defaultPrevented).toBe(false);
    await expect
      .element(page.getByText("title.mp3・5 B"))
      .not.toBeInTheDocument();

    const textPaste = dispatchPaste(
      [new File(["text"], "note.txt", { type: "text/plain" })],
      "通常の本文",
    );
    expect(textPaste.defaultPrevented).toBe(false);
  });

  it("フォーカスがない状態でも有効なメディアだけを追加し、貼り付け後に繰り返し追加できる", async () => {
    vi.spyOn(window, "fetch").mockResolvedValue(
      Response.json({
        used: 0,
        limit: 524_288_000,
        remaining: 524_288_000,
        maxFileBytes: 26_214_400,
        maxFilesPerMemo: 5,
      }),
    );
    mount(<CreateMemoForm categories={[]} />);

    await expect.element(page.getByLabelText("本文")).toBeVisible();
    await new Promise((resolve) =>
      requestAnimationFrame(() => resolve(undefined)),
    );
    const file = new File(["audio"], "repeat.mp3", { type: "audio/mpeg" });
    const first = dispatchPaste([file], undefined, window);
    expect(first.clipboardData?.items.length).toBe(1);
    expect(first.clipboardData?.items[0]?.getAsFile()?.type).toBe("audio/mpeg");
    await expect
      .element(page.getByText("repeat.mp3・5 B").first())
      .toBeVisible();
    const second = dispatchPaste([file], undefined, window);
    await expect
      .element(page.getByText("repeat.mp3・5 B").last())
      .toBeVisible();
    expect(first.defaultPrevented).toBe(true);
    expect(second.defaultPrevented).toBe(true);
  });

  it("ファイル選択で複数件を選べ、続けて選択しても追加予定を保持する", async () => {
    vi.spyOn(window, "fetch").mockImplementation(async () =>
      Response.json({
        used: 0,
        limit: 524_288_000,
        remaining: 524_288_000,
        maxFileBytes: 26_214_400,
        maxFilesPerMemo: 5,
      }),
    );
    mount(<CreateMemoForm categories={[]} />);

    const input = page.getByLabelText("追加するファイル");
    await input.upload([
      new File(["first"], "first.txt", { type: "text/plain" }),
      new File(["second"], "second.txt", { type: "text/plain" }),
    ]);
    await expect.element(page.getByText("first.txt・5 B")).toBeVisible();
    await expect.element(page.getByText("second.txt・6 B")).toBeVisible();
    await expect.element(input).toHaveValue("");

    await input.upload(
      new File(["third"], "third.txt", { type: "text/plain" }),
    );
    await expect.element(page.getByText("first.txt・5 B")).toBeVisible();
    await expect.element(page.getByText("second.txt・6 B")).toBeVisible();
    await expect.element(page.getByText("third.txt・5 B")).toBeVisible();

    await page.getByRole("button", { name: "取り消す" }).first().click();
    await expect
      .element(page.getByText("first.txt・5 B"))
      .not.toBeInTheDocument();
    await expect.element(page.getByText("second.txt・6 B")).toBeVisible();
  });

  it("メモ件数の上限到達時に入力内容を保持してエラーを通知する", async () => {
    vi.spyOn(window, "fetch").mockResolvedValue(
      Response.json(
        { code: "QUOTA_EXCEEDED", message: "メモの上限（100件）です。" },
        { status: 403 },
      ),
    );
    mount(<CreateMemoForm categories={[]} />);

    const title = page.getByLabelText("タイトル");
    const content = page.getByLabelText("本文");
    await title.fill("残してほしいタイトル");
    await content.fill("残してほしい本文");
    await page.getByRole("button", { name: "メモを作成" }).click();

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

    await page.getByLabelText("タイトル").fill("title");
    await page.getByLabelText("本文").fill("content");
    await page.getByRole("button", { name: "メモを作成" }).click();
    await expect
      .element(page.getByRole("button", { name: "メモを作成" }))
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
      .element(page.getByLabelText("タイトル"))
      .toHaveValue("共有タイトル");
    await expect
      .element(page.getByLabelText("本文"))
      .toHaveValue("共有本文\nhttps://example.com/article");
    await expect
      .element(page.getByLabelText("関連URL（任意）"))
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
      .element(page.getByLabelText("タイトル"))
      .toHaveValue("ページタイトル");
    await expect.element(page.getByLabelText("本文")).toHaveValue("");
    await expect
      .element(page.getByLabelText("関連URL（任意）"))
      .toHaveValue("https://example.com/article");
    expect(window.sessionStorage.getItem(SHARE_STORAGE_KEY)).toBeNull();
  });

  it("共有ファイルを一覧表示し、個別に外せる", async () => {
    vi.spyOn(window, "fetch").mockImplementation(async (input) => {
      if (String(input).includes("/files/share-file-1")) {
        return Response.json({
          files: [
            {
              id: "share-file-2",
              fileName: "音声.mp3",
              contentType: "audio/mpeg",
              sizeBytes: 4,
              etag: "etag-2",
              r2Key: "share-staging/share-1/two",
            },
          ],
        });
      }
      return Response.json({
        id: "share-1",
        title: "写真.png",
        text: "写真.png",
        url: null,
        status: "pending",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        prefill: {
          title: "写真.png",
          content: "写真.png",
          titleTruncated: false,
          contentTruncated: false,
        },
        files: [
          {
            id: "share-file-1",
            reservationId: "reservation-1",
            fileName: "写真.png",
            contentType: "image/png",
            sizeBytes: 3,
            etag: "etag-1",
            r2Key: "share-staging/share-1/one",
          },
          {
            id: "share-file-2",
            reservationId: "reservation-2",
            fileName: "音声.mp3",
            contentType: "audio/mpeg",
            sizeBytes: 4,
            etag: "etag-2",
            r2Key: "share-staging/share-1/two",
          },
        ],
      });
    });
    mount(
      <CreateMemoForm
        categories={[]}
        initialValues={{
          title: "写真.png",
          content: "写真.png\n音声.mp3",
          titleTruncated: false,
          contentTruncated: false,
        }}
        shareIntake={{
          id: "share-1",
          title: "写真.png",
          text: "写真.png",
          url: null,
          status: "pending",
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
          prefill: {
            title: "写真.png",
            content: "写真.png\n音声.mp3",
            titleTruncated: false,
            contentTruncated: false,
          },
          files: [
            {
              id: "share-file-1",
              reservationId: "reservation-1",
              fileName: "写真.png",
              contentType: "image/png",
              sizeBytes: 3,
              etag: "etag-1",
              r2Key: "share-staging/share-1/one",
            },
            {
              id: "share-file-2",
              reservationId: "reservation-2",
              fileName: "音声.mp3",
              contentType: "audio/mpeg",
              sizeBytes: 4,
              etag: "etag-2",
              r2Key: "share-staging/share-1/two",
            },
          ],
        }}
      />,
    );

    await expect.element(page.getByText("写真.png・3 B")).toBeVisible();
    await page.getByRole("button", { name: "外す" }).first().click();
    await expect
      .element(page.getByText("写真.png・3 B"))
      .not.toBeInTheDocument();
    await expect.element(page.getByText("音声.mp3・4 B")).toBeVisible();
    expect(window.fetch).toHaveBeenCalledWith(
      "/api/share-intakes/share-1/files/share-file-1",
      expect.objectContaining({ method: "DELETE" }),
    );
    expect(document.querySelector('input[type="file"]')).toBeNull();
  });

  it("AI要約の月次上限到達時にURLを保持してエラーを通知する", async () => {
    vi.spyOn(window, "fetch").mockResolvedValue(
      Response.json(
        { code: "QUOTA_EXCEEDED", message: "AI要約の今月の上限です。" },
        { status: 403 },
      ),
    );
    mount(<UrlSummaryForm categories={[]} />);

    const url = page.getByLabelText("要約するページのURL");
    await url.fill("https://example.com/article");
    await page.getByRole("button", { name: "要約して保存" }).click();

    await expect
      .element(page.getByRole("alert"))
      .toHaveTextContent("AI要約の今月の上限です。");
    await expect.element(url).toHaveValue("https://example.com/article");
  });

  it("入力欄にフォーカス中でもCtrl+EnterでAI要約を送信する", async () => {
    const fetchSpy = vi
      .spyOn(window, "fetch")
      .mockResolvedValue(
        Response.json({ message: "AI要約の今月の上限です。" }, { status: 403 }),
      );
    mount(<UrlSummaryForm categories={[]} />);

    const url = page.getByLabelText("要約するページのURL");
    await url.fill("https://example.com/article");
    await url.click();
    expect(fetchSpy).not.toHaveBeenCalled();
    pressCtrlEnter(document.activeElement ?? window);

    await expect.poll(() => fetchSpy.mock.calls.length).toBe(1);
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

    await page
      .getByLabelText("要約するページのURL")
      .fill("https://example.com/article");
    await page.getByRole("button", { name: "要約して保存" }).click();

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
      .element(page.getByLabelText("要約するページのURL"))
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
          mediaWidth: null,
          mediaHeight: null,
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
            thumbnailR2Key: null,
            thumbnailContentType: null,
            thumbnailSizeBytes: null,
            fileName: "sample.mp3",
            contentType: "audio/mpeg",
            sizeBytes: 3,
            mediaWidth: null,
            mediaHeight: null,
            etag: "etag-audio",
            createdAt: new Date().toISOString(),
          },
          {
            id: "video-1",
            memoId: "memo-1",
            userId: "user-1",
            r2Key: "user-1/memo-1/video-1",
            thumbnailR2Key: null,
            thumbnailContentType: null,
            thumbnailSizeBytes: null,
            fileName: "sample.mp4",
            contentType: "video/mp4",
            sizeBytes: 3,
            mediaWidth: 1920,
            mediaHeight: 1080,
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
    const audio = document.querySelector<HTMLAudioElement>("audio");
    const video = document.querySelector<HTMLVideoElement>("video");
    expect((audio as HTMLAudioElement & { loading?: string })?.loading).toBe(
      "lazy",
    );
    expect((video as HTMLVideoElement & { loading?: string })?.loading).toBe(
      "lazy",
    );
    expect(video?.preload).toBe("metadata");
    expect(video?.width).toBe(1920);
    expect(video?.height).toBe(1080);

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

    await expect.element(status).not.toBeInTheDocument();
  });
});
