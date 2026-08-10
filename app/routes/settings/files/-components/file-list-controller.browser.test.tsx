/** @jsxImportSource hono/jsx/dom */
import { render } from "hono/jsx/dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import FileListController from "./$file-list-controller";
import { FileDetailDialog } from "./file-detail-dialog";

const originalConfirm = window.confirm;

const mount = (previewKind: "image" | "audio" | "video" = "image") => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  render(
    <>
      <ul data-file-grid>
        <li data-file-card="file-1">
          <article>
            <button
              data-category-name="仕事"
              data-content-type={
                previewKind === "image"
                  ? "image/png"
                  : previewKind === "audio"
                    ? "audio/mpeg"
                    : "video/mp4"
              }
              data-endpoint="/api/attachments/file-1"
              data-file-id="file-1"
              data-file-name="photo.png"
              data-file-open="true"
              data-file-size="10 B"
              data-media-height="100"
              data-media-width="200"
              data-memo-excerpt="メモの本文"
              data-memo-href="/memos/memo-1/edit?returnTo=%2Fsettings%2Ffiles"
              data-memo-title="仕事メモ"
              data-preview-kind={previewKind}
              type="button"
            >
              詳細
            </button>
            <button
              data-file-delete="true"
              data-file-id="file-1"
              data-file-name="photo.png"
              type="button"
            >
              削除
            </button>
          </article>
        </li>
      </ul>
      <FileDetailDialog />
      <FileListController />
    </>,
    container,
  );
};

beforeEach(() => {
  window.confirm = vi.fn(() => true);
});

afterEach(() => {
  window.confirm = originalConfirm;
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("ファイル一覧モーダル", () => {
  it("画像を表示し、メモ情報をモーダルへ反映する", async () => {
    mount("image");

    await page.getByRole("button", { name: "詳細" }).click();

    await expect.element(page.getByRole("dialog")).toBeVisible();
    expect(
      document.querySelector("[data-file-dialog-title]")?.textContent,
    ).toBe("photo.png");
    expect(
      document.querySelector("[data-file-dialog-memo-title]")?.textContent,
    ).toBe("仕事メモ");
    const image = document.querySelector("[data-file-dialog-media] img");
    expect(image).toHaveAttribute("src", "/api/attachments/file-1?preview=1");
    expect(image).toHaveClass("max-h-[min(60dvh,32rem)]", "object-contain");

    await page
      .getByRole("button", { name: "ファイル詳細を閉じる" })
      .first()
      .click();
    expect(document.querySelector("dialog")?.hasAttribute("open")).toBe(false);
  });

  it.each([
    ["audio", "audio"],
    ["video", "video"],
  ] as const)("%sをモーダルで再生可能にする", async (previewKind, tagName) => {
    mount(previewKind);

    await page.getByRole("button", { name: "詳細" }).click();

    await expect.element(page.getByRole("dialog")).toBeVisible();
    expect(
      document.querySelector(`[data-file-dialog-media] ${tagName}`),
    ).toHaveAttribute("src", "/api/attachments/file-1?preview=1");
    expect(
      document.querySelector<HTMLMediaElement>(
        `[data-file-dialog-media] ${tagName}`,
      )?.volume,
    ).toBe(0.25);
  });

  it("一覧から確認後に削除し、カードを取り除く", async () => {
    mount();
    vi.spyOn(window, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );

    await page.getByRole("button", { name: "削除" }).click();

    const status = page.getByText("ファイルを削除しました。");
    await expect.element(status).toBeVisible();
    await expect.element(status).toHaveClass("alert-soft", "alert-success");
    expect(document.querySelector("[data-file-list-controller]")).toHaveClass(
      "toast",
      "toast-end",
      "toast-bottom",
    );
    await expect
      .element(page.getByRole("button", { name: "詳細" }))
      .not.toBeInTheDocument();
    await expect.element(status).not.toBeInTheDocument();
    expect(window.fetch).toHaveBeenCalledWith(
      "/api/attachments/file-1",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("モーダルから確認後に削除し、モーダルを閉じる", async () => {
    mount();
    vi.spyOn(window, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );

    await page.getByRole("button", { name: "詳細" }).click();
    await expect.element(page.getByRole("dialog")).toBeVisible();
    document
      .querySelector<HTMLButtonElement>("[data-file-dialog-delete]")
      ?.click();

    await expect
      .element(page.getByText("ファイルを削除しました。"))
      .toBeVisible();
    expect(document.querySelector("dialog")?.hasAttribute("open")).toBe(false);
    await expect
      .element(page.getByRole("button", { name: "詳細" }))
      .not.toBeInTheDocument();
  });

  it("削除APIが失敗した場合はカードを残してエラーを表示する", async () => {
    mount();
    vi.spyOn(window, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ message: "削除に失敗しました。" }), {
        status: 502,
      }),
    );

    await page.getByRole("button", { name: "削除" }).click();

    await expect.element(page.getByText("削除に失敗しました。")).toBeVisible();
    await expect
      .element(page.getByRole("button", { name: "詳細" }))
      .toBeInTheDocument();
  });
});
