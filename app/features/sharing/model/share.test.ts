import { describe, expect, it } from "vitest";
import {
  createMediaSharePrefill,
  getShareDestination,
  normalizePendingShare,
} from "./share";

const share = (input: { title?: string; text?: string; url?: string }) =>
  normalizePendingShare({ ...input, receivedAt: Date.now() });

describe("共有内容の振り分け", () => {
  it("メディアだけなら先頭ファイル名をタイトルと本文に補完する", () => {
    expect(
      createMediaSharePrefill(normalizePendingShare({}), [
        { fileName: "写真.png", contentType: "image/png", sizeBytes: 3 },
        { fileName: "音声.mp3", contentType: "audio/mpeg", sizeBytes: 4 },
      ]),
    ).toMatchObject({
      title: "写真.png",
      content: "写真.png\n音声.mp3",
      url: undefined,
    });
  });

  it("ファイル付きURL共有は通常メモのURL欄へURLを補完する", () => {
    expect(
      createMediaSharePrefill(
        normalizePendingShare({ text: "コメント https://example.com/article" }),
        [{ fileName: "添付.txt", contentType: "text/plain", sizeBytes: 1 }],
      ),
    ).toMatchObject({
      title: "コメント https://example.com/article",
      content: "コメント https://example.com/article",
      url: "https://example.com/article",
    });
  });

  it("URLフィールドだけなら共有タイトル付きの選択対象URLにする", () => {
    expect(
      getShareDestination(
        share({ title: "ページタイトル", url: "https://example.com/a" }),
      ),
    ).toMatchObject({
      kind: "url",
      url: "https://example.com/a",
      memoPrefill: {
        title: "ページタイトル",
        content: "",
        url: "https://example.com/a",
      },
    });
  });

  it("textに入った単独URLを選択対象URLにする", () => {
    expect(
      getShareDestination(
        share({ title: "ページタイトル", text: "https://example.com/a" }),
      ),
    ).toMatchObject({
      kind: "url",
      url: "https://example.com/a",
      memoPrefill: { title: "ページタイトル", content: "" },
    });
  });

  it("共有タイトルがなければURLのホスト名をタイトルにする", () => {
    expect(
      getShareDestination(share({ url: "https://example.com:8443/a" })),
    ).toMatchObject({
      kind: "url",
      memoPrefill: {
        title: "example.com:8443",
        content: "",
        url: "https://example.com:8443/a",
      },
    });
  });

  it("コメント付きURLは通常メモにし、URL欄にも設定する", () => {
    expect(
      getShareDestination(share({ text: "後で読む\nhttps://example.com/a" })),
    ).toMatchObject({
      kind: "memo",
      prefill: {
        title: "後で読む",
        content: "後で読む\nhttps://example.com/a",
        url: "https://example.com/a",
      },
    });
  });

  it("複数URLは通常メモにし、URL欄を空にする", () => {
    expect(
      getShareDestination(
        share({ text: "A https://example.com/a B https://example.com/b" }),
      ),
    ).toMatchObject({ kind: "memo", prefill: { url: undefined } });
  });

  it("タイトルがなければ本文の先頭行をタイトルにする", () => {
    expect(
      getShareDestination(share({ text: "  見出し  \n本文" })),
    ).toMatchObject({
      kind: "memo",
      prefill: { title: "見出し", content: "見出し  \n本文" },
    });
  });

  it("URL以外のプロトコルはAI要約にせず通常メモにする", () => {
    expect(
      getShareDestination(share({ text: "ftp://example.com/file" })),
    ).toMatchObject({ kind: "memo" });
  });

  it("空の共有はエラー扱いにする", () => {
    expect(getShareDestination(share({}))).toEqual({ kind: "invalid" });
  });

  it("タイトルと本文を既存上限で切り詰める", () => {
    const title = "あ".repeat(300);
    const text = "い".repeat(10_100);
    expect(getShareDestination(share({ title, text }))).toMatchObject({
      kind: "memo",
      prefill: {
        title: "あ".repeat(255),
        content: "い".repeat(10_000),
        titleTruncated: true,
        contentTruncated: true,
      },
    });
  });
});
