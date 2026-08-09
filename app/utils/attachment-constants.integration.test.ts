import { describe, expect, it } from "vitest";
import {
  parseMediaDimensions,
  sanitizeAttachmentFileName,
} from "./attachment-constants";

describe("添付ファイル名", () => {
  it("multipart由来の区切り文字と制御文字を除去して255文字に制限する", () => {
    expect(sanitizeAttachmentFileName(" ../folder\\file\u0000.txt ")).toBe(
      ".._folder_file_.txt",
    );
    expect(sanitizeAttachmentFileName("a".repeat(300))).toHaveLength(255);
  });
});

describe("添付media寸法", () => {
  it("画像と動画は幅・高さを必須にする", () => {
    expect(parseMediaDimensions("image/png", "1920", "1080")).toEqual({
      width: 1920,
      height: 1080,
    });
    expect(() => parseMediaDimensions("video/mp4", "1920", null)).toThrow(
      "画像・動画の寸法が不足しています。",
    );
  });

  it("音声には寸法を指定できない", () => {
    expect(parseMediaDimensions("audio/mpeg", null, null)).toBeNull();
    expect(() => parseMediaDimensions("audio/mpeg", "1", "1")).toThrow(
      "音声・その他の添付には寸法を指定できません。",
    );
  });

  it("0・負数・過大値を拒否する", () => {
    expect(() => parseMediaDimensions("image/png", "0", "100")).toThrow(
      "画像・動画の寸法が不正です。",
    );
    expect(() => parseMediaDimensions("image/png", "100001", "100")).toThrow(
      "画像・動画の寸法が不正です。",
    );
  });
});
