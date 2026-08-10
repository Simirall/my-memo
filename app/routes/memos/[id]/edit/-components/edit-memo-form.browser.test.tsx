/** @jsxImportSource hono/jsx/dom */
import { render } from "hono/jsx/dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import EditMemoForm from "./$edit-memo-form";

const category = {
  id: "category-1",
  userId: "user-1",
  name: "仕事",
  createdAt: "2026-08-02 00:00:00",
  updatedAt: "2026-08-02 00:00:00",
};

const attachment = {
  id: "attachment-1",
  memoId: "memo-1",
  userId: "user-1",
  r2Key: "users/user-1/memos/memo-1/attachment-1",
  thumbnailR2Key: null,
  thumbnailContentType: null,
  thumbnailSizeBytes: null,
  fileName: "資料.txt",
  contentType: "text/plain",
  sizeBytes: 3,
  mediaWidth: null,
  mediaHeight: null,
  etag: "etag-1",
  createdAt: "2026-08-02 00:00:00",
};

function mount(content: string | null = "AI本文") {
  const container = document.createElement("div");
  document.body.appendChild(container);
  render(
    <EditMemoForm
      availableTags={[{ id: "tag-1", name: "既存タグ" }]}
      categories={[category]}
      memo={{
        id: "memo-1",
        title: "AIタイトル",
        content,
        url: "https://example.com",
        categoryId: category.id,
        isAiSummary: 1,
        tags: [{ id: "tag-1", name: "既存タグ" }],
        attachments: [attachment],
      }}
      returnTo="/"
    />,
    container,
  );
}

function dispatchPaste(
  files: ReadonlyArray<File>,
  target: EventTarget = document.querySelector("form") ?? window,
): ClipboardEvent {
  const clipboard = new DataTransfer();
  for (const file of files) clipboard.items.add(file);
  const event = new Event("paste", {
    bubbles: true,
    cancelable: true,
  }) as ClipboardEvent;
  Object.defineProperty(event, "clipboardData", { value: clipboard });
  target.dispatchEvent(event);
  return event;
}

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("メモ編集フォーム", () => {
  it("本文なしのメモを空欄で表示しNULLとして更新する", async () => {
    const fetchMock = vi
      .spyOn(window, "fetch")
      .mockResolvedValue(
        Response.json({ message: "テスト用エラー" }, { status: 400 }),
      );
    mount(null);

    const content = page.getByLabelText("本文（任意）");
    await expect.element(content).toHaveValue("");
    await expect.element(content).not.toBeRequired();
    await page.getByLabelText("タイトル").fill("更新タイトル");
    await page.getByRole("button", { name: "更新" }).click();

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/memos/memo-1",
      expect.objectContaining({
        method: "PATCH",
        body: expect.stringContaining('"content":null'),
      }),
    );
  });

  it("本文欄にMarkdown入力の案内を表示する", async () => {
    mount();

    await expect
      .element(page.getByText("Markdownで入力できます。"))
      .toBeVisible();
    expect(
      document
        .querySelector("#edit-memo-content")
        ?.getAttribute("aria-describedby"),
    ).toBe("edit-memo-content-help");
  });

  it("既存添付の容量を二重計上せずメディアを貼り付けられる", async () => {
    vi.spyOn(window, "fetch").mockResolvedValue(
      Response.json({
        used: 3,
        limit: 7,
        remaining: 4,
        maxFileBytes: 26_214_400,
        maxFilesPerMemo: 5,
      }),
    );
    mount();

    await new Promise((resolve) =>
      requestAnimationFrame(() => resolve(undefined)),
    );
    const event = dispatchPaste(
      [new File(["ab"], "pasted.mp3", { type: "audio/mpeg" })],
      window,
    );

    await expect.element(page.getByText("pasted.mp3・2 B")).toBeVisible();
    expect(event.defaultPrevented).toBe(true);
  });

  it("AI要約メモの編集画面でフォーカスなしのメディア貼り付けを追加予定にする", async () => {
    vi.spyOn(window, "fetch").mockResolvedValue(
      Response.json({
        used: 3,
        limit: 524_288_000,
        remaining: 524_287_997,
        maxFileBytes: 26_214_400,
        maxFilesPerMemo: 5,
      }),
    );
    mount();

    await expect.element(page.getByText("✨ AI要約")).toBeVisible();
    await new Promise((resolve) =>
      requestAnimationFrame(() => resolve(undefined)),
    );
    const event = dispatchPaste(
      [new File(["audio"], "pasted.mp3", { type: "audio/mpeg" })],
      window,
    );

    await expect.element(page.getByText("pasted.mp3・5 B")).toBeVisible();
    await expect
      .element(page.getByRole("status"))
      .toHaveTextContent("1件のメディアを追加しました。");
    expect(event.defaultPrevented).toBe(true);
  });

  it("AIラベルと既存のメモ項目・添付を初期表示する", async () => {
    mount();

    await expect.element(page.getByText("✨ AI要約")).toBeVisible();
    await expect
      .element(page.getByLabelText("タイトル"))
      .toHaveValue("AIタイトル");
    await expect.element(page.getByLabelText("本文")).toHaveValue("AI本文");
    await expect
      .element(page.getByLabelText("関連URL（任意）"))
      .toHaveValue("https://example.com");
    await expect
      .element(page.getByLabelText("カテゴリー"))
      .toHaveValue("category-1");
    await expect.element(page.getByText("資料.txt")).toBeVisible();
  });

  it("タグと添付の変更を更新前の下書きとして保持する", async () => {
    vi.spyOn(window, "fetch").mockResolvedValue(
      Response.json({
        used: 3,
        limit: 100,
        remaining: 97,
        maxFileBytes: 26_214_400,
        maxFilesPerMemo: 5,
      }),
    );
    mount();

    await page.getByRole("button", { name: "既存タグを外す" }).click();
    await page.getByPlaceholder("タグを入力").fill("新規タグ");
    await page.getByText("#新規タグを新しいタグとして追加").click();
    await expect.element(page.getByText("#新規タグ")).toBeVisible();
  });

  it("タグ候補を選択でき、ファイルを続けて追加予定にできる", async () => {
    vi.spyOn(window, "fetch").mockResolvedValue(
      Response.json({
        used: 3,
        limit: 100,
        remaining: 97,
        maxFileBytes: 26_214_400,
        maxFilesPerMemo: 5,
      }),
    );
    mount();

    await page.getByRole("button", { name: "既存タグを外す" }).click();
    await page.getByPlaceholder("タグを入力").fill("既存");
    await page.getByText("#既存タグ").click();
    await expect.element(page.getByText("#既存タグ")).toBeVisible();

    const input = page.getByLabelText("追加するファイル");
    await input.upload(
      new File(["first"], "first.txt", { type: "text/plain" }),
    );
    await expect.element(page.getByText(/first\.txt/)).toBeVisible();
    await expect.element(input).toHaveValue("");

    await input.upload(
      new File(["second"], "second.txt", { type: "text/plain" }),
    );
    await expect.element(page.getByText(/first\.txt/)).toBeVisible();
    await expect.element(page.getByText(/second\.txt/)).toBeVisible();
    await expect.element(page.getByText("追加予定")).toBeVisible();
    await expect.element(page.getByText("更新時にアップロード")).toBeVisible();
  });

  it("編集内容を更新APIへ送信する", async () => {
    const fetchMock = vi
      .spyOn(window, "fetch")
      .mockResolvedValue(
        Response.json({ message: "テスト用エラー" }, { status: 400 }),
      );
    mount();

    await page.getByLabelText("本文").fill("変更後の本文");
    await page.getByRole("button", { name: "更新" }).click();

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/memos/memo-1",
      expect.objectContaining({
        method: "PATCH",
        body: expect.stringContaining('"content":"変更後の本文"'),
      }),
    );
    await expect
      .element(page.getByRole("alert"))
      .toHaveTextContent("テスト用エラー");
  });

  it("キャンセルは戻り先へのリンクとして動作する", async () => {
    mount();

    await expect
      .element(page.getByRole("link", { name: "キャンセル" }))
      .toHaveAttribute("href", "/");
  });

  it("未保存の変更がある場合は破棄確認を表示し、キャンセルできる", async () => {
    mount();
    await page.getByLabelText("本文").fill("変更後の本文");
    const cancelLink = page.getByRole("link", { name: "キャンセル" });

    await cancelLink.click();

    const dialog = page.getByRole("dialog", { name: "変更破棄の確認" });
    await expect.element(dialog).toBeVisible();
    await expect
      .element(page.getByText("未保存の変更を破棄しますか？"))
      .toBeVisible();
    await expect
      .element(dialog.getByRole("button", { name: "キャンセル", exact: true }))
      .toHaveFocus();

    await dialog
      .getByRole("button", { name: "キャンセル", exact: true })
      .click();
    expect(document.activeElement).toBe(cancelLink.element());
  });
});
