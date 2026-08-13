import { describe, expect, it } from "vitest";
import {
  hasCurrentLegalConsent,
  hasStoredCurrentLegalConsent,
  LEGAL_EFFECTIVE_AT,
} from "./consent";

describe("利用規約の同意日時", () => {
  it.each([null, "", "invalid", "2026-08-12T23:59:59+09:00"])(
    "%sは現行規約への同意として扱わない",
    (acceptedAt) => {
      expect(hasCurrentLegalConsent(acceptedAt)).toBe(false);
    },
  );

  it.each([LEGAL_EFFECTIVE_AT, "2026-08-13T00:00:01+09:00"])(
    "%sは現行規約への同意として扱う",
    (acceptedAt) => {
      expect(hasCurrentLegalConsent(acceptedAt)).toBe(true);
    },
  );

  it("ブラウザーストレージを読めない場合は未同意として扱う", () => {
    expect(
      hasStoredCurrentLegalConsent({
        getItem: () => {
          throw new Error("blocked");
        },
      }),
    ).toBe(false);
  });
});
