import path from "node:path";
import {
  cloudflareTest,
  readD1Migrations,
} from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "app"),
    },
  },
  plugins: [
    cloudflareTest(async () => ({
      miniflare: {
        compatibilityDate: "2025-11-17",
        compatibilityFlags: ["nodejs_compat"],
        d1Databases: ["MY_MEMO_D1"],
        r2Buckets: ["MY_MEMO_FILES"],
        bindings: {
          TEST_MIGRATIONS: await readD1Migrations(
            path.join(import.meta.dirname, "migrations"),
          ),
        },
      },
    })),
  ],
  test: {
    include: ["app/**/*.integration.test.ts", "app/**/*.integration.test.tsx"],
    setupFiles: ["./tests/setup/apply-migrations.ts"],
  },
});
