import { describe, expect, it } from "vitest";
import { currentUtcMonthStart } from "../../app/utils/authorization";

describe("AI要約の月次集計期間", () => {
  it("日本時間では月が替わっていてもUTC基準で集計月を判定する", () => {
    expect(currentUtcMonthStart(new Date("2026-04-30T15:00:00+09:00"))).toBe(
      "2026-04-01",
    );
    expect(currentUtcMonthStart(new Date("2026-05-01T08:59:59+09:00"))).toBe(
      "2026-04-01",
    );
    expect(currentUtcMonthStart(new Date("2026-05-01T09:00:00+09:00"))).toBe(
      "2026-05-01",
    );
  });
});
