import { describe, expect, it } from "vitest";
import { memoSchema } from "./memo-schema";

describe("メモ本文の入力上限", () => {
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
