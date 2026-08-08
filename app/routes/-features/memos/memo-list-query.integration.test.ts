import { describe, expect, it } from "vitest";
import {
  buildMemoListUrl,
  getSafeMemoListReturnTo,
  parseMemoListQuery,
  replaceMemoListTag,
} from "./memo-list-query";

describe("メモ一覧URL条件", () => {
  const ownedTagIds = new Set(["tag-1", "tag-2"]);

  it("パラメータがない場合は新しい順だけを既定値にする", () => {
    expect(parseMemoListQuery(new URLSearchParams(), ownedTagIds)).toEqual({
      sort: "desc",
      type: undefined,
      attachment: undefined,
      tag: undefined,
    });
    expect(buildMemoListUrl("/", { sort: "desc" })).toBe("/");
  });

  it("有効な条件を解析し既定値を省いた正規URLを作る", () => {
    const query = parseMemoListQuery(
      new URLSearchParams("sort=asc&type=ai&attachment=with&tag=tag-1"),
      ownedTagIds,
    );

    expect(query).toEqual({
      sort: "asc",
      type: "ai",
      attachment: "with",
      tag: "tag-1",
    });
    expect(buildMemoListUrl("/categories/category-1", query)).toBe(
      "/categories/category-1?sort=asc&type=ai&attachment=with&tag=tag-1",
    );
  });

  it("不正値・重複値・所有していないタグを無視する", () => {
    const query = parseMemoListQuery(
      new URLSearchParams(
        "sort=asc&sort=desc&type=other&attachment=some&tag=other-tag",
      ),
      ownedTagIds,
    );

    expect(query).toEqual({
      sort: "desc",
      type: undefined,
      attachment: undefined,
      tag: undefined,
    });
  });

  it("現在の条件を維持してタグだけを置き換える", () => {
    expect(
      replaceMemoListTag(
        "/categories/category-1",
        { sort: "asc", type: "link", tag: "tag-1" },
        "tag-2",
      ),
    ).toBe("/categories/category-1?sort=asc&type=link&tag=tag-2");
  });

  it("編集後の戻り先に安全な一覧パスと有効な条件を保持する", () => {
    expect(
      getSafeMemoListReturnTo(
        "/categories/category-1?sort=asc&type=ai&attachment=with&tag=tag-1",
        ownedTagIds,
      ),
    ).toBe("/categories/category-1?sort=asc&type=ai&attachment=with&tag=tag-1");
    expect(getSafeMemoListReturnTo("/?type=link&tag=tag-2", ownedTagIds)).toBe(
      "/?type=link&tag=tag-2",
    );
  });

  it("編集後の戻り先から外部・廃止済み・不正な条件を除外する", () => {
    expect(getSafeMemoListReturnTo("//example.com/", ownedTagIds)).toBe("/");
    expect(getSafeMemoListReturnTo("/tags/tag-1?sort=asc", ownedTagIds)).toBe(
      "/",
    );
    expect(
      getSafeMemoListReturnTo(
        "/categories/category-1?sort=other&type=other&tag=other-tag",
        ownedTagIds,
      ),
    ).toBe("/categories/category-1");
  });
});
