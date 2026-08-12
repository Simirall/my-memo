import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("../public/service-worker.js", import.meta.url),
  "utf8",
);

describe("Service Workerのキャッシュ範囲", () => {
  it("実行時cache書き込みやハッシュ資産の包括cacheを持たない", () => {
    expect(source).not.toContain("cache.put(");
    expect(source).not.toContain('startsWith("/static/")');
    expect(source).toContain("PRECACHE_URLS.includes(url.pathname)");
  });

  it("installとactivateの非同期処理をwaitUntilへ渡す", () => {
    expect(source.match(/event\.waitUntil\(/g)).toHaveLength(2);
  });
});
