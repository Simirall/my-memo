import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "app"),
    },
  },
  test: {
    retry: process.env.CI ? 1 : 0,
    include: ["app/**/*.test.ts"],
    exclude: ["app/**/*.integration.test.ts"],
  },
});
