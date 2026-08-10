import { describe, expect, it } from "vitest";
import { readLimitedJson } from "./read-limited-json";

describe("JSONリクエストの読み込み上限", () => {
  it("上限以内のJSONを読み込む", async () => {
    const result = await readLimitedJson(
      new Request("https://example.com", {
        method: "POST",
        body: JSON.stringify({ content: "本文" }),
      }),
      64,
    );

    expect(result).toEqual({ ok: true, value: { content: "本文" } });
  });

  it("Content-Lengthが上限を超える場合は本文を読まず拒否する", async () => {
    const result = await readLimitedJson(
      new Request("https://example.com", {
        method: "POST",
        headers: { "Content-Length": "65" },
        body: "{}",
      }),
      64,
    );

    expect(result).toEqual({ ok: false, reason: "too_large" });
  });

  it("実際の本文が上限を超える場合も拒否する", async () => {
    const result = await readLimitedJson(
      new Request("https://example.com", {
        method: "POST",
        body: JSON.stringify({ content: "a".repeat(100) }),
      }),
      64,
    );

    expect(result).toEqual({ ok: false, reason: "too_large" });
  });

  it("不正なJSONを拒否する", async () => {
    const result = await readLimitedJson(
      new Request("https://example.com", { method: "POST", body: "{" }),
      64,
    );

    expect(result).toEqual({ ok: false, reason: "invalid" });
  });
});
