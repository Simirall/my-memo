import { vi } from "vitest";
export const navigation = {
  push: vi.fn(async (_to: string) => {}),
  replace: vi.fn(async (_to: string) => {}),
  reload: vi.fn(async () => {}),
  back: vi.fn(),
  forward: vi.fn(),
  prefetch: vi.fn(),
  path: "/",
  query: "",
  hash: "",
};
