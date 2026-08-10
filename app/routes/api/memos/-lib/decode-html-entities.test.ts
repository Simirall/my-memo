import { describe, expect, it } from "vitest";
import { decodeHtmlEntities } from "./decode-html-entities";

describe("HTMLエンティティの復元", () => {
  it("要約元ページで使う基本エンティティを文字へ戻す", () => {
    expect(
      decodeHtmlEntities(
        "&quot;引用&quot; &amp; &apos;文字&apos; &lt;tag&gt;&nbsp;末尾",
      ),
    ).toBe("\"引用\" & '文字' <tag> 末尾");
  });

  it("未対応のエンティティは情報を失わずそのまま残す", () => {
    expect(decodeHtmlEntities("A &copy; B &#169; C")).toBe(
      "A &copy; B &#169; C",
    );
  });
});
