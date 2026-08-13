import { describe, expect, it } from "vitest";
import { getCreatedMemoListPath } from "./memo-create-navigation";

describe("メモ作成後の遷移先", () => {
  it("保存先カテゴリーの先頭へ戻る", () => {
    expect(getCreatedMemoListPath("category-1", "category-1")).toBe(
      "/categories/category-1",
    );
  });

  it("カテゴリーなしなら全件一覧へ戻る", () => {
    expect(getCreatedMemoListPath("", undefined)).toBe("/");
  });

  it("全件一覧から作成した場合は保存先カテゴリーがあっても全件一覧へ戻る", () => {
    expect(getCreatedMemoListPath("category-1", undefined)).toBe("/");
  });
});
