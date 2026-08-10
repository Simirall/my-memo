import { describe, expect, it } from "vitest";
import {
  formatClipboardRejections,
  selectClipboardMedia,
} from "./clipboard-media";

describe("クリップボードメディア選別", () => {
  it("既存の画像・音声・動画プレビュー形式を受け付ける", () => {
    const selected = selectClipboardMedia(
      [
        new File(["image"], "image.png", { type: "image/png" }),
        new File(["audio"], "audio.mp3", { type: "audio/mpeg" }),
        new File(["video"], "video.mp4", { type: "video/mp4" }),
      ],
      {
        currentCount: 0,
        currentBytes: 0,
        maxFiles: 5,
        maxFileBytes: 10,
        availableBytes: 20,
      },
    );

    expect(selected.accepted.map((file) => file.name)).toEqual([
      "image.png",
      "audio.mp3",
      "video.mp4",
    ]);
    expect(selected.rejected).toHaveLength(0);
  });

  it("対応形式を順番に追加し、非対応形式と上限超過を理由付きで返す", () => {
    const selected = selectClipboardMedia(
      [
        new File(["a"], "audio.mp3", { type: "audio/mpeg" }),
        new File(["b"], "note.txt", { type: "text/plain" }),
        new File(["123456"], "large.mp3", { type: "audio/mpeg" }),
        new File(["c"], "last.mp3", { type: "audio/mpeg" }),
      ],
      {
        currentCount: 0,
        currentBytes: 0,
        maxFiles: 2,
        maxFileBytes: 5,
        availableBytes: 10,
      },
    );

    expect(selected.accepted.map((file) => file.name)).toEqual([
      "audio.mp3",
      "last.mp3",
    ]);
    expect(selected.rejected.map(({ reason }) => reason)).toEqual([
      "unsupported",
      "file-size",
    ]);
    expect(formatClipboardRejections(selected.rejected)).toBe(
      "非対応形式1件、ファイルサイズ超過1件",
    );
  });

  it("既存候補の件数と容量を含めて後続メディアを除外する", () => {
    const selected = selectClipboardMedia(
      [new File(["1234"], "next.mp3", { type: "audio/mpeg" })],
      {
        currentCount: 4,
        currentBytes: 5,
        maxFiles: 5,
        maxFileBytes: 10,
        availableBytes: 8,
      },
    );

    expect(selected.accepted).toHaveLength(0);
    expect(selected.rejected[0]?.reason).toBe("quota");
  });
});
