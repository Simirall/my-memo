import { spawnSync } from "node:child_process";
import { readdir } from "node:fs/promises";
import path from "node:path";

const appDirectory = path.resolve("app");
const pnpmCli = process.env.npm_execpath;
if (!pnpmCli) {
  throw new Error("pnpm run test:collect経由で実行してください。");
}
const pnpmUsesNode = /\.(?:c?js|mjs)$/i.test(pnpmCli);
const categories = {
  unit: /\.test\.ts$/,
  integration: /\.integration\.test\.(?:ts|tsx)$/,
  browser: /\.browser\.test\.tsx$/,
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

const expected = Object.fromEntries(
  Object.keys(categories).map((key) => [key, new Set()]),
);
const errors = [];
for (const file of files) {
  const relativePath = path.relative(process.cwd(), file).replaceAll("\\", "/");
  const matches = Object.entries(categories)
    .filter(([name, pattern]) => {
      if (name === "unit" && relativePath.includes(".integration.test.")) {
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

const listCommands = {
  unit: ["exec", "vitest", "list", "--config=vitest.unit.config.ts"],
  integration: ["exec", "vitest", "list", "--config=vitest.config.ts"],
  browser: ["exec", "vitest", "list", "--config=vitest.browser.config.ts"],
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
      `${name}: vitest listに失敗しました。\n${result.stderr || result.stdout}`,
    );
    collected[name] = new Set();
    continue;
  }

  collected[name] = new Set(
    result.stdout
      .split(/\r?\n/)
      .map((line) =>
        line.match(/^(?:\[[^\]]+\]\s+)?(app[\\/].+?\.test\.(?:ts|tsx))\s+>/),
      )
      .filter(Boolean)
      .map((match) => match[1].replaceAll("\\", "/")),
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
  `テスト収集: unit=${collected.unit.size}, integration=${collected.integration.size}, browser=${collected.browser.size}`,
);
