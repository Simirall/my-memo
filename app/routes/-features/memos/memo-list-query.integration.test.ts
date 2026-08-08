import { describe, expect, it } from "vitest";
import {
  buildMemoListUrl,
  getEmptyMemoListRedirectUrl,
  getSafeMemoListReturnTo,
  parseMemoListQuery,
  replaceMemoListTag,
} from "./memo-list-query";

describe("メモ一覧URL条件", () => {
  const ownedTagIds = new Set(["tag-1", "tag-2"]);

  it("パラメータがない場合は新しい順と1ページ目を既定値にする", () => {
    expect(parseMemoListQuery(new URLSearchParams(), ownedTagIds)).toEqual({
      sort: "desc",
      page: 1,
      type: undefined,
      attachment: undefined,
      tag: undefined,
    });
    expect(buildMemoListUrl("/", { sort: "desc", page: 1 })).toBe("/");
  });

  it("有効な条件を解析し既定値を省いた正規URLを作る", () => {
    const query = parseMemoListQuery(
      new URLSearchParams("sort=asc&page=2&type=ai&attachment=with&tag=tag-1"),
      ownedTagIds,
    );

    expect(query).toEqual({
      sort: "asc",
      page: 2,
      type: "ai",
      attachment: "with",
      tag: "tag-1",
    });
    expect(buildMemoListUrl("/categories/category-1", query)).toBe(
      "/categories/category-1?sort=asc&page=2&type=ai&attachment=with&tag=tag-1",
    );
  });

  it("不正値・重複値・所有していないタグを無視する", () => {
    const query = parseMemoListQuery(
      new URLSearchParams(
        "sort=asc&sort=desc&page=2&page=3&type=other&attachment=some&tag=other-tag",
      ),
      ownedTagIds,
    );

    expect(query).toEqual({
      sort: "desc",
      page: 1,
      type: undefined,
      attachment: undefined,
      tag: undefined,
    });
  });

  it("ページ番号は正の安全な整数だけを受け入れる", () => {
    for (const value of ["0", "-1", "1.5", "abc", "9007199254740992"]) {
      expect(
        parseMemoListQuery(new URLSearchParams(`page=${value}`), ownedTagIds)
          .page,
      ).toBe(1);
    }
  });

  it("現在の条件を維持してタグを置き換え1ページ目へ戻す", () => {
    expect(
      replaceMemoListTag(
        "/categories/category-1",
        { sort: "asc", page: 4, type: "link", tag: "tag-1" },
        "tag-2",
      ),
    ).toBe("/categories/category-1?sort=asc&type=link&tag=tag-2");
  });

  it("編集後の戻り先に安全な一覧パスと有効な条件を保持する", () => {
    expect(
      getSafeMemoListReturnTo(
        "/categories/category-1?sort=asc&page=3&type=ai&attachment=with&tag=tag-1",
        ownedTagIds,
      ),
    ).toBe(
      "/categories/category-1?sort=asc&page=3&type=ai&attachment=with&tag=tag-1",
    );
    expect(getSafeMemoListReturnTo("/?type=link&tag=tag-2", ownedTagIds)).toBe(
      "/?type=link&tag=tag-2",
    );
  });

  it("存在しない深いページは条件を維持して1ページ目へ誘導する", () => {
    const query = {
      sort: "asc" as const,
      page: 4,
      type: "ai" as const,
      tag: "tag-1",
    };

    expect(getEmptyMemoListRedirectUrl("/", query, 0)).toBe(
      "/?sort=asc&type=ai&tag=tag-1",
    );
    expect(getEmptyMemoListRedirectUrl("/", query, 1)).toBeUndefined();
    expect(
      getEmptyMemoListRedirectUrl("/", { ...query, page: 1 }, 0),
    ).toBeUndefined();
  });

  it("編集後の戻り先から外部・廃止済み・不正な条件を除外する", () => {
    expect(getSafeMemoListReturnTo("//example.com/", ownedTagIds)).toBe("/");
    expect(getSafeMemoListReturnTo("/tags/tag-1?sort=asc", ownedTagIds)).toBe(
      "/",
    );
    expect(
      getSafeMemoListReturnTo(
        "/categories/category-1?sort=other&page=-1&type=other&tag=other-tag",
        ownedTagIds,
      ),
    ).toBe("/categories/category-1");
  });
});
