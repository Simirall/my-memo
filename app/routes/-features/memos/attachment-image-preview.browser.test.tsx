/** @jsxImportSource hono/jsx/dom */
import { render } from "hono/jsx/dom";
import { afterEach, describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import AttachmentManager from "./$attachment-manager";

const attachments = [
  {
    id: "image-1",
    memoId: "memo-1",
    userId: "user-1",
    r2Key: "user-1/memo-1/image-1",
    fileName: "first.png",
    contentType: "image/png",
    sizeBytes: 10,
    mediaWidth: 800,
    mediaHeight: 600,
    etag: "etag-1",
    createdAt: "2026-08-09 00:00:00",
  },
  {
    id: "audio-1",
    memoId: "memo-1",
    userId: "user-1",
    r2Key: "user-1/memo-1/audio-1",
    fileName: "sound.mp3",
    contentType: "audio/mpeg",
    sizeBytes: 10,
    mediaWidth: null,
    mediaHeight: null,
    etag: "etag-audio",
    createdAt: "2026-08-09 00:00:00",
  },
  {
    id: "image-2",
    memoId: "memo-1",
    userId: "user-1",
    r2Key: "user-1/memo-1/image-2",
    fileName: "second.png",
    contentType: "image/png",
    sizeBytes: 10,
    mediaWidth: 1200,
    mediaHeight: 900,
    etag: "etag-2",
    createdAt: "2026-08-09 00:00:00",
  },
] as const;

const mount = () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  render(
    <AttachmentManager
      initialAttachments={attachments}
      memoId="memo-1"
      readOnly
    />,
    container,
  );
};

const getDialog = () =>
  document.querySelector<HTMLDialogElement>("[data-attachment-image-dialog]");

const getViewport = () =>
  document.querySelector<HTMLElement>("[data-attachment-preview-viewport]");

const pointer = (
  type: string,
  {
    id = 1,
    pointerType = "touch",
    x,
    y,
  }: { id?: number; pointerType?: "mouse" | "touch"; x: number; y: number },
) =>
  new PointerEvent(type, {
    bubbles: true,
    clientX: x,
    clientY: y,
    pointerId: id,
    pointerType,
  });

afterEach(() => {
  document.body.replaceChildren();
});

describe("メモ一覧の画像拡大プレビュー", () => {
  it("画像をクリックしてファイル名と画像枚数を表示し、閉じた後にフォーカスを戻す", async () => {
    mount();
    const opener = page.getByRole("button", {
      name: "画像「first.png」を拡大表示",
    });
    await opener.click();

    await expect.element(page.getByRole("dialog")).toBeVisible();
    await expect.element(page.getByText("first.png").last()).toBeVisible();
    await expect.element(page.getByText("1 / 2")).toBeVisible();
    expect(
      document.querySelector("[data-attachment-preview-image]"),
    ).toHaveAttribute("src", "/api/attachments/image-1?preview=1");

    await page
      .getByRole("button", { name: "画像プレビューを閉じる" })
      .first()
      .click();
    expect(getDialog()?.open).toBe(false);
    expect(document.activeElement).toBe(opener.element());
  });

  it("閉じた後に別画像を開くときは新しい画像を描画してからモーダルを表示する", async () => {
    mount();
    await page
      .getByRole("button", { name: "画像「first.png」を拡大表示" })
      .click();
    const dialog = getDialog();
    dialog?.close();

    const sourcesAtOpen: Array<string | null> = [];
    const originalShowModal = dialog?.showModal.bind(dialog);
    if (dialog && originalShowModal) {
      dialog.showModal = () => {
        sourcesAtOpen.push(
          dialog
            .querySelector("[data-attachment-preview-image]")
            ?.getAttribute("src") ?? null,
        );
        originalShowModal();
      };
    }

    await page
      .getByRole("button", { name: "画像「second.png」を拡大表示" })
      .click();

    await expect.element(page.getByRole("dialog")).toBeVisible();
    expect(sourcesAtOpen).toEqual(["/api/attachments/image-2?preview=1"]);
  });

  it("同じメモの画像だけを前後ボタンと左右キーで切り替えて端で停止する", async () => {
    mount();
    await page
      .getByRole("button", { name: "画像「first.png」を拡大表示" })
      .click();

    await expect
      .element(page.getByRole("button", { name: "前へ" }))
      .toBeDisabled();
    await page.getByRole("button", { name: "次へ" }).click();
    await expect.element(page.getByText("2 / 2")).toBeVisible();
    await expect
      .element(page.getByRole("button", { name: "次へ" }))
      .toBeDisabled();
    expect(
      document.querySelector("[data-attachment-preview-image]"),
    ).toHaveAttribute("src", "/api/attachments/image-2?preview=1");

    getDialog()?.dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, key: "ArrowLeft" }),
    );
    await expect.element(page.getByText("1 / 2")).toBeVisible();
  });

  it("ホイールとモバイルのダブルタップで拡大する", async () => {
    mount();
    await page
      .getByRole("button", { name: "画像「first.png」を拡大表示" })
      .click();
    const viewport = getViewport();
    const image = document.querySelector<HTMLElement>(
      "[data-attachment-preview-image]",
    );

    viewport?.dispatchEvent(
      new WheelEvent("wheel", {
        bubbles: true,
        cancelable: true,
        deltaY: -100,
      }),
    );
    await expect.poll(() => image?.style.transform).toContain("scale(1.2)");

    viewport?.dispatchEvent(pointer("pointerdown", { x: 100, y: 100 }));
    viewport?.dispatchEvent(pointer("pointerup", { x: 100, y: 100 }));
    viewport?.dispatchEvent(pointer("pointerdown", { x: 100, y: 100 }));
    viewport?.dispatchEvent(pointer("pointerup", { x: 100, y: 100 }));
    await expect.poll(() => image?.style.transform).toContain("scale(1)");
    viewport?.dispatchEvent(pointer("pointerdown", { x: 100, y: 100 }));
    viewport?.dispatchEvent(pointer("pointerup", { x: 100, y: 100 }));
    viewport?.dispatchEvent(pointer("pointerdown", { x: 100, y: 100 }));
    viewport?.dispatchEvent(pointer("pointerup", { x: 100, y: 100 }));
    await expect.poll(() => image?.style.transform).toContain("scale(2)");
  });

  it("初期表示をcontainにし、画像の標準ドラッグよりプレビュー操作を優先する", async () => {
    mount();
    await page
      .getByRole("button", { name: "画像「first.png」を拡大表示" })
      .click();
    const viewport = getViewport();
    const image = document.querySelector<HTMLImageElement>(
      "[data-attachment-preview-image]",
    );

    expect(image).toHaveClass(
      "absolute",
      "inset-0",
      "size-full",
      "object-contain",
    );
    expect(getComputedStyle(image as HTMLImageElement).objectFit).toBe(
      "contain",
    );
    expect(image?.draggable).toBe(false);
    expect(
      image?.dispatchEvent(
        new DragEvent("dragstart", { bubbles: true, cancelable: true }),
      ),
    ).toBe(false);
    expect(
      viewport?.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          cancelable: true,
          clientX: 100,
          clientY: 100,
          pointerId: 1,
          pointerType: "mouse",
        }),
      ),
    ).toBe(false);
  });

  it("PCでは画像領域のシングルクリックで閉じる", async () => {
    mount();
    await page
      .getByRole("button", { name: "画像「first.png」を拡大表示" })
      .click();
    const viewport = getViewport();

    viewport?.dispatchEvent(
      pointer("pointerdown", {
        pointerType: "mouse",
        x: 100,
        y: 100,
      }),
    );
    viewport?.dispatchEvent(
      pointer("pointerup", { pointerType: "mouse", x: 100, y: 100 }),
    );
    viewport?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(getDialog()?.open).toBe(false);
  });

  it("モバイルのタップとPCのドラッグ終了では閉じない", async () => {
    mount();
    await page
      .getByRole("button", { name: "画像「first.png」を拡大表示" })
      .click();
    const viewport = getViewport();

    viewport?.dispatchEvent(pointer("pointerdown", { x: 100, y: 100 }));
    viewport?.dispatchEvent(pointer("pointerup", { x: 100, y: 100 }));
    viewport?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(getDialog()?.open).toBe(true);

    viewport?.dispatchEvent(
      pointer("pointerdown", {
        pointerType: "mouse",
        x: 100,
        y: 100,
      }),
    );
    viewport?.dispatchEvent(
      pointer("pointermove", {
        pointerType: "mouse",
        x: 150,
        y: 100,
      }),
    );
    viewport?.dispatchEvent(
      pointer("pointerup", { pointerType: "mouse", x: 150, y: 100 }),
    );
    viewport?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(getDialog()?.open).toBe(true);
  });

  it("pointercancelでは画像切替やモーダル終了を確定しない", async () => {
    mount();
    await page
      .getByRole("button", { name: "画像「first.png」を拡大表示" })
      .click();
    const viewport = getViewport();
    Object.defineProperty(viewport, "clientWidth", {
      configurable: true,
      value: 500,
    });
    Object.defineProperty(viewport, "clientHeight", {
      configurable: true,
      value: 500,
    });

    viewport?.dispatchEvent(pointer("pointerdown", { x: 400, y: 250 }));
    viewport?.dispatchEvent(pointer("pointermove", { x: 200, y: 250 }));
    viewport?.dispatchEvent(pointer("pointercancel", { x: 200, y: 250 }));

    expect(getDialog()?.open).toBe(true);
    await expect.element(page.getByText("1 / 2")).toBeVisible();
    expect(
      document.querySelector<HTMLElement>("[data-attachment-preview-image]")
        ?.style.transform,
    ).toContain("translate3d(0px, 0px, 0px)");
  });

  it("等倍の横スワイプで画像を切り替え、切替時に倍率をリセットする", async () => {
    mount();
    await page
      .getByRole("button", { name: "画像「first.png」を拡大表示" })
      .click();
    const viewport = getViewport();
    Object.defineProperty(viewport, "clientWidth", {
      configurable: true,
      value: 500,
    });
    Object.defineProperty(viewport, "clientHeight", {
      configurable: true,
      value: 500,
    });

    viewport?.dispatchEvent(pointer("pointerdown", { x: 400, y: 250 }));
    viewport?.dispatchEvent(pointer("pointermove", { x: 250, y: 250 }));
    viewport?.dispatchEvent(pointer("pointerup", { x: 250, y: 250 }));

    await expect.element(page.getByText("2 / 2")).toBeVisible();
    expect(
      document.querySelector<HTMLElement>("[data-attachment-preview-image]")
        ?.style.transform,
    ).toContain("scale(1)");
  });

  it("等倍の短い縦ドラッグでは戻り、20パーセント以上なら閉じる", async () => {
    mount();
    await page
      .getByRole("button", { name: "画像「first.png」を拡大表示" })
      .click();
    const viewport = getViewport();
    Object.defineProperty(viewport, "clientWidth", {
      configurable: true,
      value: 500,
    });
    Object.defineProperty(viewport, "clientHeight", {
      configurable: true,
      value: 500,
    });

    viewport?.dispatchEvent(pointer("pointerdown", { x: 250, y: 200 }));
    viewport?.dispatchEvent(pointer("pointermove", { x: 250, y: 250 }));
    viewport?.dispatchEvent(pointer("pointerup", { x: 250, y: 250 }));
    expect(getDialog()?.open).toBe(true);

    viewport?.dispatchEvent(pointer("pointerdown", { x: 250, y: 200 }));
    viewport?.dispatchEvent(pointer("pointermove", { x: 250, y: 320 }));
    viewport?.dispatchEvent(pointer("pointerup", { x: 250, y: 320 }));
    expect(getDialog()?.open).toBe(false);
  });

  it("ピンチを3倍までに制限し、拡大時の縦操作を閉じる操作にしない", async () => {
    mount();
    await page
      .getByRole("button", { name: "画像「first.png」を拡大表示" })
      .click();
    const viewport = getViewport();
    Object.defineProperty(viewport, "clientWidth", {
      configurable: true,
      value: 500,
    });
    Object.defineProperty(viewport, "clientHeight", {
      configurable: true,
      value: 500,
    });

    viewport?.dispatchEvent(pointer("pointerdown", { id: 1, x: 100, y: 200 }));
    viewport?.dispatchEvent(pointer("pointerdown", { id: 2, x: 200, y: 200 }));
    viewport?.dispatchEvent(pointer("pointermove", { id: 2, x: 500, y: 200 }));
    await expect
      .poll(
        () =>
          document.querySelector<HTMLElement>("[data-attachment-preview-image]")
            ?.style.transform,
      )
      .toContain("scale(3)");
    viewport?.dispatchEvent(pointer("pointerup", { id: 2, x: 500, y: 200 }));
    viewport?.dispatchEvent(pointer("pointerup", { id: 1, x: 100, y: 400 }));
    expect(getDialog()?.open).toBe(true);
  });

  it("画像の読み込みに失敗してもモーダルを閉じて再表示できる", async () => {
    mount();
    const opener = page.getByRole("button", {
      name: "画像「first.png」を拡大表示",
    });
    await opener.click();
    document
      .querySelector("[data-attachment-preview-image]")
      ?.dispatchEvent(new Event("error"));
    expect(getDialog()?.open).toBe(true);

    getDialog()?.close();
    await opener.click();
    await expect.element(page.getByRole("dialog")).toBeVisible();
  });
});
