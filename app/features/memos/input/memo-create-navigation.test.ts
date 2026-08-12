import { describe, expect, it } from "vitest";
import { getCreatedMemoListPath } from "./memo-create-navigation";

describe("メモ作成後の遷移先", () => {
  it("保存先カテゴリーの先頭へ戻る", () => {
    expect(getCreatedMemoListPath("category-1")).toBe("/categories/category-1");
  });

  it("カテゴリーなしなら全件一覧へ戻る", () => {
    expect(getCreatedMemoListPath("")).toBe("/");
  });
});
