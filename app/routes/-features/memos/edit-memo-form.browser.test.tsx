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
  fileName: "資料.txt",
  contentType: "text/plain",
  sizeBytes: 3,
  mediaWidth: null,
  mediaHeight: null,
  etag: "etag-1",
  createdAt: "2026-08-02 00:00:00",
};

function mount() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  render(
    <EditMemoForm
      availableTags={[{ id: "tag-1", name: "既存タグ" }]}
      categories={[category]}
      memo={{
        id: "memo-1",
        title: "AIタイトル",
        content: "AI本文",
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

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("メモ編集フォーム", () => {
  it("AIラベルと既存のメモ項目・添付を初期表示する", async () => {
    mount();

    await expect.element(page.getByText("✨ AI Summary")).toBeVisible();
    await expect
      .element(page.getByLabelText("Title"))
      .toHaveValue("AIタイトル");
    await expect.element(page.getByLabelText("Content")).toHaveValue("AI本文");
    await expect
      .element(page.getByLabelText("URL (optional)"))
      .toHaveValue("https://example.com");
    await expect
      .element(page.getByLabelText("Category"))
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

    await page.getByLabelText("Content").fill("変更後の本文");
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
});
