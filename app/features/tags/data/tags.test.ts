import { describe, expect, it } from "vitest";
import {
  MAX_TAGS_PER_MEMO,
  normalizeTagNames,
  parseTagNamesField,
} from "./tags";

describe("タグ入力の検証", () => {
  it("前後空白を除去し、完全一致の重複をまとめる", () => {
    expect(normalizeTagNames(["  仕事", "仕事", "React"])).toEqual({
      ok: true,
      names: ["仕事", "React"],
    });
  });

  it("空白、長すぎる名前、タグ数超過を拒否する", () => {
    expect(normalizeTagNames(["   "]).ok).toBe(false);
    expect(normalizeTagNames(["仕事 メモ"]).ok).toBe(false);
    expect(normalizeTagNames(["a".repeat(31)]).ok).toBe(false);
    expect(
      normalizeTagNames(
        Array.from({ length: MAX_TAGS_PER_MEMO + 1 }, (_, index) =>
          String(index),
        ),
      ).ok,
    ).toBe(false);
  });

  it("フォームのJSON配列を読み取る", () => {
    expect(parseTagNamesField(JSON.stringify(["a", "b"]))).toEqual({
      ok: true,
      names: ["a", "b"],
    });
    expect(parseTagNamesField("not-json").ok).toBe(false);
  });
});
