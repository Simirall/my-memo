/** @jsxImportSource hono/jsx/dom */
import { render } from "hono/jsx/dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import AttachmentManager from "@/features/memos/list/attachments/$attachment-manager";

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

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("添付ファイル削除", () => {
  it("確認前は削除せず、確定後に削除APIを呼び出す", async () => {
    const fetchMock = vi
      .spyOn(window, "fetch")
      .mockResolvedValueOnce(Response.json({ ok: true }))
      .mockResolvedValueOnce(
        Response.json({
          used: 0,
          limit: 100,
          remaining: 100,
          maxFileBytes: 26_214_400,
          maxFilesPerMemo: 5,
        }),
      );
    const container = document.createElement("div");
    document.body.appendChild(container);
    render(
      <AttachmentManager initialAttachments={[attachment]} memoId="memo-1" />,
      container,
    );

    await page.getByRole("button", { name: "削除", exact: true }).click();
    await expect
      .element(page.getByRole("dialog", { name: "削除の確認" }))
      .toBeVisible();
    expect(fetchMock).not.toHaveBeenCalled();

    await page
      .getByRole("dialog", { name: "削除の確認" })
      .getByRole("button", { name: "削除", exact: true })
      .click();

    await expect.element(page.getByText("資料.txt")).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/attachments/attachment-1",
      expect.objectContaining({ method: "DELETE" }),
    );
  });
});
