import { expect, it, vi } from "vitest";

vi.mock("waku/router/server", () => ({
  unstable_getRequest: vi.fn(),
  unstable_parseRouterRequest: vi.fn(),
  unstable_setNonce: vi.fn(),
  unstable_notFound: vi.fn(),
  unstable_redirect: vi.fn(),
}));

import request from "./request";

it("Honoのコンテキストがないビルド処理は認証処理をせず継続する", async () => {
  const next = vi.fn(async () => "build metadata");

  await expect(request(next)).resolves.toBe("build metadata");
  expect(next).toHaveBeenCalledOnce();
});
