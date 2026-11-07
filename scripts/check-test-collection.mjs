import { spawnSync } from "node:child_process";
import { readdir } from "node:fs/promises";
import path from "node:path";

const appDirectory = path.resolve("app");
const e2eDirectory = path.resolve("tests/e2e");
const pnpmCli = process.env.npm_execpath;
if (!pnpmCli) {
  throw new Error("pnpm run test:collect経由で実行してください。");
}
const pnpmUsesNode = /\.(?:c?js|mjs)$/i.test(pnpmCli);
const categories = {
  unit: /\.test\.ts$/,
  integration: /\.integration\.test\.(?:ts|tsx)$/,
  browser: /\.browser\.test\.tsx$/,
  e2e: /\.e2e\.test\.ts$/,
};

const files = [];
const visit = async (directory) => {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) await visit(entryPath);
    else if (entry.name.includes(".test.")) files.push(entryPath);
  }
};

await visit(appDirectory);
await visit(e2eDirectory);

const expected = Object.fromEntries(
  Object.keys(categories).map((key) => [key, new Set()]),
);
const errors = [];
for (const file of files) {
  const relativePath = path.relative(process.cwd(), file).replaceAll("\\", "/");
  const matches = Object.entries(categories)
    .filter(([name, pattern]) => {
      if (
        name === "unit" &&
        (relativePath.includes(".integration.test.") ||
          relativePath.includes(".e2e.test."))
      ) {
        return false;
      }
      return pattern.test(relativePath);
    })
    .map(([name]) => name);

  if (matches.length !== 1) {
    errors.push(`${relativePath}: 分類数が${matches.length}件です。`);
    continue;
  }
  expected[matches[0]].add(relativePath);
}

const vitestList = ["exec", "vitest", "list", "--json"];
const listCommands = {
  unit: [...vitestList, "--config=vitest.unit.config.ts"],
  integration: [...vitestList, "--config=vitest.config.ts"],
  browser: [...vitestList, "--config=vitest.browser.config.ts"],
  e2e: ["exec", "playwright", "test", "--list"],
};

const collected = {};
for (const [name, args] of Object.entries(listCommands)) {
  const result = spawnSync(
    pnpmUsesNode ? process.execPath : pnpmCli,
    pnpmUsesNode ? [pnpmCli, ...args] : args,
    {
      cwd: process.cwd(),
      encoding: "utf8",
      windowsHide: true,
    },
  );
  if (result.status !== 0) {
    errors.push(
      `${name}: テスト一覧の取得に失敗しました。\n${result.stderr || result.stdout}`,
    );
    collected[name] = new Set();
    continue;
  }

  const listedFiles =
    name === "e2e"
      ? [...result.stdout.matchAll(/›\s+(.+?\.e2e\.test\.ts):\d+/g)].map(
          ([, file]) => path.join("tests/e2e", file),
        )
      : JSON.parse(result.stdout).map(({ file }) =>
          path.relative(process.cwd(), file),
        );
  collected[name] = new Set(
    listedFiles.map((file) => file.replaceAll("\\", "/")),
  );
}

for (const name of Object.keys(categories)) {
  if (expected[name].size === 0) {
    errors.push(`${name}: 対象テストファイルがありません。`);
  }
  for (const file of expected[name]) {
    if (!collected[name]?.has(file)) {
      errors.push(`${name}: ${file}がVitestに収集されていません。`);
    }
  }
  for (const file of collected[name] ?? []) {
    if (!expected[name].has(file)) {
      errors.push(`${name}: 想定外の${file}がVitestに収集されています。`);
    }
  }
}

if (errors.length > 0) {
  throw new Error(`テスト収集設定を確認してください。\n${errors.join("\n")}`);
}

console.log(
  `テスト収集: unit=${collected.unit.size}, integration=${collected.integration.size}, browser=${collected.browser.size}, e2e=${collected.e2e.size}`,
);
