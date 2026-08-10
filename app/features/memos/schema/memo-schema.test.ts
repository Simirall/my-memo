import { describe, expect, it } from "vitest";
import { memoSchema } from "./memo-schema";

describe("メモ本文の入力上限", () => {
  it.each([null, "", " \t\n　"])("空の本文 %j をNULLにする", (content) => {
    expect(memoSchema.create.shape.content.parse(content)).toBeNull();
    expect(memoSchema.update.shape.content.parse(content)).toBeNull();
  });

  it("非空本文の前後空白を維持する", () => {
    const content = "  本文\n";
    expect(memoSchema.create.shape.content.parse(content)).toBe(content);
    expect(memoSchema.update.shape.content.parse(content)).toBe(content);
  });

  it("本文キーの省略を拒否する", () => {
    expect(memoSchema.create.shape.content.safeParse(undefined).success).toBe(
      false,
    );
    expect(memoSchema.update.shape.content.safeParse(undefined).success).toBe(
      false,
    );
  });

  it("10,000文字の本文を受け付ける", () => {
    expect(
      memoSchema.create.shape.content.safeParse("a".repeat(10_000)).success,
    ).toBe(true);
  });

  it("10,001文字の本文を拒否する", () => {
    expect(
      memoSchema.create.shape.content.safeParse("a".repeat(10_001)).success,
    ).toBe(false);
    expect(
      memoSchema.update.shape.content.safeParse("a".repeat(10_001)).success,
    ).toBe(false);
  });
});
