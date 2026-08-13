import { describe, expect, it } from "vitest";
import { isPublicPath } from "./public-paths";

describe("未認証で閲覧できるパス", () => {
  it.each(["/terms", "/privacy", "/login", "/share/consume"])(
    "%sを公開する",
    (path) => {
      expect(isPublicPath(path)).toBe(true);
    },
  );

  it.each(["/", "/settings/account", "/terms-draft", "/privacy/internal"])(
    "%sを公開しない",
    (path) => {
      expect(isPublicPath(path)).toBe(false);
    },
  );
});
