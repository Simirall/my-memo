import { describe, expect, it } from "vitest";
import {
  getShareDestination,
  normalizePendingShare,
} from "../../app/utils/share";

const share = (input: { title?: string; text?: string; url?: string }) =>
  normalizePendingShare({
    ...input,
    receivedAt: Date.now(),
  });

describe("共有内容の振り分け", () => {
  it("URLフィールドだけなら付随タイトルを無視してAI要約へ送る", () => {
    expect(
      getShareDestination(
        share({ title: "ページタイトル", url: "https://example.com/a" }),
      ),
    ).toEqual({ kind: "url-summary", url: "https://example.com/a" });
  });

  it("textに入った単独URLをAI要約へ送る", () => {
    expect(
      getShareDestination(
        share({ title: "ページタイトル", text: "https://example.com/a" }),
      ),
    ).toEqual({ kind: "url-summary", url: "https://example.com/a" });
  });

  it("コメント付きURLは通常メモにし、URL欄にも設定する", () => {
    expect(
      getShareDestination(
        share({
          text: "後で読む\nhttps://example.com/a",
        }),
      ),
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
    ).toMatchObject({
      kind: "memo",
      prefill: { url: undefined },
    });
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
