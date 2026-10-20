import { createHmac, randomUUID } from "node:crypto";
import { test as base, expect } from "@playwright/test";
import { createTestHarness, type TestHarness } from "wrangler";

const secret = "my-memo-e2e-secret-at-least-32-characters";
const image = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);
type Env = Cloudflare.Env;
type Fixtures = {
  appUrl: string;
  env: Env;
  ownerCookie: string;
  otherCookie: string;
  server: TestHarness;
};
const sign = (token: string) =>
  `${token}.${createHmac("sha256", secret).update(token).digest("base64")}`;
const seedUser = async (env: Env, id: string) => {
  const now = Math.floor(Date.now() / 1000);
  const token = randomUUID();
  await env.MY_MEMO_D1.batch([
    env.MY_MEMO_D1.prepare(
      "INSERT INTO user (id,name,email,email_verified,role,banned,plan_id,created_at,updated_at) VALUES (?,?,?,1,'user',0,'free',?,?)",
    ).bind(id, id, `${id}@example.com`, now, now),
    env.MY_MEMO_D1.prepare(
      "INSERT INTO session (id,expires_at,token,created_at,updated_at,user_id) VALUES (?,?,?,?,?,?)",
    ).bind(randomUUID(), now + 3_600, token, now, now, id),
  ]);
  return sign(token);
};

const test = base.extend<Fixtures>({
  // biome-ignore lint/correctness/noEmptyPattern: Playwright requires fixture arguments to use object destructuring.
  server: async ({}, use) => {
    const server = createTestHarness({
      workers: [
        {
          configPath: "dist/server/wrangler.json",
          // Workers AIは既定でリモート接続するため、未使用でもローカルに置き換える。
          bindingOverrides: { AI: "e2e-disabled-ai" },
          secrets: {
            BETTER_AUTH_URL: "http://localhost",
            BETTER_AUTH_SECRET: secret,
            GITHUB_CLIENT_ID: "e2e-client",
            GITHUB_CLIENT_SECRET: "e2e-client-secret",
          },
        },
        {
          config: {
            name: "e2e-disabled-ai",
            main: "tests/e2e/disabled-ai.ts",
            compatibility_date: "2026-08-12",
          },
        },
      ],
    });
    await use(server);
    await server.close();
  },
  appUrl: async ({ server }, use) => {
    const { url } = await server.listen();
    await server.getWorker<Env>().applyD1Migrations("MY_MEMO_D1");
    await use(url.origin);
  },
  env: async ({ server }, use) => use(await server.getWorker<Env>().getEnv()),
  ownerCookie: async ({ env }, use) => use(await seedUser(env, "owner")),
  otherCookie: async ({ env }, use) => use(await seedUser(env, "other")),
});

test.beforeEach(async ({ appUrl, ownerCookie, page }) => {
  await page.context().addCookies([
    {
      name: "better-auth.session_token",
      value: ownerCookie,
      url: appUrl,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  await page.addInitScript(() => {
    localStorage.setItem("my-memo:legal-consent-at", new Date().toISOString());
    localStorage.setItem("my-memo.install-prompt-dismissed", "1");
  });
});

test.afterEach(async ({ server }, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus) server.debug();
});

test.setTimeout(60_000);

test("SSRとRSCの所有者分離を維持し、nonce付きCSPで内部遷移できる", async ({
  env,
  page,
  server,
  appUrl,
  ownerCookie,
  otherCookie,
}) => {
  await env.MY_MEMO_D1.batch([
    env.MY_MEMO_D1.prepare(
      "INSERT INTO memos (id,user_id,title,content) VALUES ('owner-ssr','owner','所有者だけのメモ','サーバーで描画する本文')",
    ),
    env.MY_MEMO_D1.prepare(
      "INSERT INTO memos (id,user_id,title,content) VALUES ('other-ssr','other','別所有者のメモ','別所有者の本文')",
    ),
  ]);
  const cookie = (token: string) => ({
    Cookie: `better-auth.session_token=${token}`,
  });
  const denied = await server.fetch("/admin/users", {
    headers: cookie(ownerCookie),
  });
  expect(denied.status).toBe(403);
  expect(await denied.text()).not.toContain("owner@example.com");
  const response = await server.fetch("/", { headers: cookie(ownerCookie) });
  const html = await response.text();
  expect(html).toContain("サーバーで描画する本文");
  expect(html).not.toContain("別所有者の本文");
  const nonce = response.headers
    .get("Content-Security-Policy")
    ?.match(/'nonce-([^']+)'/)?.[1];
  expect(nonce).toBeTruthy();
  expect(html).toContain(`nonce="${nonce}"`);
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.addInitScript(() => {
    const violations: string[] = [];
    Reflect.set(window, "migrationCspViolations", violations);
    window.addEventListener("securitypolicyviolation", (event) =>
      violations.push(event.effectiveDirective),
    );
  });
  const rscRequests: string[] = [];
  page.on("response", (res) => {
    if (new URL(res.url()).pathname.startsWith("/RSC/"))
      rscRequests.push(res.url());
  });
  await page.goto(`${appUrl}/`);
  await expect(
    page.getByRole("heading", { name: "所有者だけのメモ" }),
  ).toBeVisible();
  await page.evaluate(() => {
    Object.assign(window, { migrationDocument: "preserved" });
  });
  let resumeNavigation = () => {};
  const navigationGate = new Promise<void>((resolve) => {
    resumeNavigation = resolve;
  });
  await page.route("**/RSC/**", async (route) => {
    if (route.request().url().includes("owner-ssr")) await navigationGate;
    await route.continue();
  });
  const navigationRequest = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      url.pathname.startsWith("/RSC/") && url.pathname.includes("owner-ssr")
    );
  });
  try {
    await page.getByRole("link", { name: "編集", exact: true }).click();
    await navigationRequest;
    await expect(
      page.getByRole("heading", { name: "所有者だけのメモ" }),
    ).toBeVisible();
    await expect(page).toHaveURL(`${appUrl}/`);
    await expect(
      page.getByRole("textbox", { name: "タイトル", exact: true }),
    ).not.toBeVisible();
  } finally {
    resumeNavigation();
  }
  await expect(
    page.getByRole("textbox", { name: "タイトル", exact: true }),
  ).toHaveValue("所有者だけのメモ");
  expect(
    await page.evaluate(() => Reflect.get(window, "migrationDocument")),
  ).toBe("preserved");
  const rsc = rscRequests.find((url) => url.includes("owner-ssr"));
  expect(rsc).toBeTruthy();
  const rscPath =
    new URL(rsc as string).pathname + new URL(rsc as string).search;
  const ownerRsc = await server.fetch(rscPath, {
    headers: cookie(ownerCookie),
  });
  expect(ownerRsc.headers.get("Cache-Control")).toBe("private, no-store");
  expect(await ownerRsc.text()).toContain("所有者だけのメモ");
  for (const headers of [cookie(otherCookie), {}]) {
    const result = await server.fetch(rscPath, { headers });
    expect(await result.text()).not.toContain("所有者だけのメモ");
  }
  await Promise.all(
    Array.from({ length: 6 }, async (_, index) => {
      const owner = index % 2 === 0;
      const result = await server.fetch("/", {
        headers: cookie(owner ? ownerCookie : otherCookie),
      });
      const body = await result.text();
      expect(body).toContain(
        owner ? "サーバーで描画する本文" : "別所有者の本文",
      );
      expect(body).not.toContain(
        owner ? "別所有者の本文" : "サーバーで描画する本文",
      );
    }),
  );
  await page.getByRole("link", { name: "My Memo", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "所有者だけのメモ" }),
  ).toBeVisible();
  await page.goBack();
  await expect(
    page.getByRole("textbox", { name: "タイトル", exact: true }),
  ).toHaveValue("所有者だけのメモ");
  expect(pageErrors).toEqual([]);
  expect(
    await page.evaluate(() => Reflect.get(window, "migrationCspViolations")),
  ).toEqual([]);
});

test("未保存編集では内部リンクと履歴移動の取り消しを保持し、保存後は確認せず戻る", async ({
  env,
  page,
  appUrl,
}) => {
  await env.MY_MEMO_D1.prepare(
    "INSERT INTO memos (id,user_id,title,content) VALUES ('dirty-memo','owner','離脱確認のメモ','保存済みの本文')",
  ).run();
  await page.goto(`${appUrl}/`);
  await page.getByRole("link", { name: "編集", exact: true }).click();
  const title = page.getByRole("textbox", { name: "タイトル", exact: true });
  await expect(title).toHaveValue("離脱確認のメモ");
  const editUrl = page.url();
  await page.getByRole("link", { name: "My Memo", exact: true }).click();
  await expect(page).toHaveURL(`${appUrl}/`);
  await page.goBack();
  await expect(page).toHaveURL(editUrl);
  await title.fill("未保存のタイトル");
  const dismissConfirmation = () =>
    new Promise<void>((resolve) => {
      page.once("dialog", async (dialog) => {
        expect(dialog.type()).toBe("confirm");
        await dialog.dismiss();
        resolve();
      });
    });
  let dismissed = dismissConfirmation();
  await page.getByRole("link", { name: "My Memo", exact: true }).click();
  await dismissed;
  await expect(page).toHaveURL(editUrl);
  await expect(title).toHaveValue("未保存のタイトル");

  for (const direction of ["back", "forward", "back"] as const) {
    dismissed = dismissConfirmation();
    await page.evaluate((direction) => history[direction](), direction);
    await dismissed;
    await expect(page).toHaveURL(editUrl);
    await expect(title).toHaveValue("未保存のタイトル");
  }

  page.once("dialog", (dialog) => dialog.accept());
  await page.evaluate(() => history.back());
  await expect(page).toHaveURL(`${appUrl}/`);
  await expect(
    page.getByRole("heading", { name: "離脱確認のメモ", exact: true }),
  ).toBeVisible();
  await page.goForward();
  await expect(title).toHaveValue("離脱確認のメモ");
  await title.fill("保存するタイトル");

  const unexpectedDialogs: string[] = [];
  page.on("dialog", async (dialog) => {
    unexpectedDialogs.push(dialog.message());
    await dialog.dismiss();
  });
  await page.getByRole("button", { name: "更新", exact: true }).click();
  await expect(page).toHaveURL(`${appUrl}/`);
  await expect(
    page.getByRole("heading", { name: "保存するタイトル", exact: true }),
  ).toBeVisible();
  expect(unexpectedDialogs).toEqual([]);
});

test("設定内の遷移で現在地を更新し、モバイルメニューを閉じる", async ({
  page,
  appUrl,
  isMobile,
}) => {
  await page.goto(`${appUrl}/settings/categories`);
  await page.evaluate(() =>
    Object.assign(window, { settingsDocument: "preserved" }),
  );
  if (isMobile) await page.getByLabel("設定メニューを開く").click();
  await page
    .getByRole("navigation", { name: "設定", exact: true })
    .getByRole("link", { name: "タグ", exact: true })
    .click();
  await expect(page).toHaveURL(`${appUrl}/settings/tags`);
  await expect(
    page.getByRole("heading", { name: "タグ", exact: true }),
  ).toBeVisible();
  await expect(page.locator("#settings-drawer")).not.toBeChecked();
  if (isMobile) await page.getByLabel("設定メニューを開く").click();
  const menu = page.getByRole("navigation", { name: "設定", exact: true });
  await expect(
    menu.getByRole("link", { name: "タグ", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(
    menu.getByRole("link", { name: "カテゴリー", exact: true }),
  ).not.toHaveAttribute("aria-current", "page");
  await menu.getByRole("link", { name: "カテゴリー", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "カテゴリー", exact: true }),
  ).toBeVisible();
  await expect(page.locator("#settings-drawer")).not.toBeChecked();
  expect(
    await page.evaluate(() => Reflect.get(window, "settingsDocument")),
  ).toBe("preserved");
});

test("退会処理中の画面制限はHTTPとRSC遷移の両方で適用する", async ({
  env,
  page,
  server,
  appUrl,
  ownerCookie,
}) => {
  await env.MY_MEMO_D1.prepare(
    "INSERT INTO memos (id,user_id,title,content) VALUES ('deleting-memo','owner','退会制限の対象','本文')",
  ).run();
  await page.goto(`${appUrl}/`);
  await expect(
    page.getByRole("heading", { name: "退会制限の対象" }),
  ).toBeVisible();
  await env.MY_MEMO_D1.prepare(
    "INSERT INTO account_deletion_requests (id,user_id,receipt_hash,status) VALUES ('deleting','owner','receipt-hash','failed')",
  ).run();
  const response = await server.fetch("/", {
    headers: { Cookie: `better-auth.session_token=${ownerCookie}` },
    redirect: "manual",
  });
  expect(response.status).toBe(307);
  expect(response.headers.get("Location")).toBe("/settings/account");
  await page.getByRole("link", { name: "編集", exact: true }).click();
  await expect(page).toHaveURL(`${appUrl}/settings/account`);
  await expect(
    page.getByRole("heading", { name: "退会制限の対象" }),
  ).not.toBeVisible();
});

test("タグ保存後はRSCで再取得し、絞り込み結果と候補へ反映する", async ({
  env,
  page,
  appUrl,
}) => {
  await env.MY_MEMO_D1.prepare(
    "INSERT INTO memos (id,user_id,title,content) VALUES ('tag-refresh','owner','タグ更新対象','本文')",
  ).run();
  await page.goto(`${appUrl}/`);
  await page.getByRole("button", { name: "タグを編集: タグ更新対象" }).click();
  await page.getByRole("dialog").getByRole("combobox").fill("新しいタグ");
  await page
    .getByRole("option", { name: "#新しいタグを新しいタグとして追加" })
    .click();
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "#新しいタグ", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "#新しいタグ", exact: true }).click();
  await page.getByRole("button", { name: "タグを編集: タグ更新対象" }).click();
  await page.getByRole("button", { name: "新しいタグを外す" }).click();
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(
    page.getByText("条件に一致するメモはありません。"),
  ).toBeVisible();
});

test("テキスト共有は本文をURLへ出さず受付から作成画面へ復元する", async ({
  page,
  appUrl,
}) => {
  await page.goto(`${appUrl}/`);
  await page.evaluate(() => {
    const form = document.createElement("form");
    form.action = "/share";
    form.method = "post";
    for (const [name, value] of Object.entries({
      title: "共有タイトル",
      text: '<script>alert("共有本文")</script>',
    })) {
      const input = document.createElement("input");
      input.name = name;
      input.value = value;
      form.appendChild(input);
    }
    document.body.appendChild(form);
    form.submit();
  });
  await expect(page).toHaveURL(/\/memos\/create\?shared=1$/);
  await expect(
    page.getByRole("textbox", { name: "タイトル", exact: true }),
  ).toHaveValue("共有タイトル");
  await expect(
    page.getByRole("textbox", { name: "本文", exact: true }),
  ).toHaveValue('<script>alert("共有本文")</script>');
  expect(page.url()).not.toContain("共有本文");
});

test("一括入力で失敗行だけ再試行し、全件保存後にトップへ戻る", async ({
  env,
  page,
  appUrl,
}) => {
  await env.MY_MEMO_D1.prepare(
    "INSERT INTO categories (id,user_id,name) VALUES ('bulk-work','owner','仕事')",
  ).run();
  await page.goto(`${appUrl}/`);
  await page
    .getByRole("button", { name: "作成メニューを開く", exact: true })
    .click();
  await page.getByRole("link", { name: "メモを一括作成", exact: true }).click();
  const first = page.getByRole("row", { name: "メモ1", exact: true });
  await first.getByLabel("タイトル（必須）").fill("移行メモ1");
  await first.getByLabel("タイトル（必須）").press("Tab");
  await expect(first.getByLabel("本文", { exact: true })).toBeFocused();
  await page.keyboard.type("元のメモ本文");
  await first
    .getByLabel("カテゴリー", { exact: true })
    .selectOption("bulk-work");
  await first
    .getByRole("combobox", { name: "タグ", exact: true })
    .fill("移行タグ");
  await first
    .getByRole("option", {
      name: "#移行タグを新しいタグとして追加",
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "行を追加", exact: true }).click();
  const second = page.getByRole("row", { name: "メモ2", exact: true });
  await second.getByLabel("本文", { exact: true }).fill("未保存の本文");
  await page.getByRole("button", { name: "まとめて保存", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "メモ2: タイトルを入力してください",
  );
  await expect(first.getByLabel("タイトル（必須）")).toBeDisabled();
  await expect(second.getByLabel("本文", { exact: true })).toHaveValue(
    "未保存の本文",
  );
  await second.getByLabel("タイトル（必須）").fill("移行メモ2");
  await page.getByRole("button", { name: "まとめて保存", exact: true }).click();
  await expect(page).toHaveURL(`${appUrl}/`);
  expect(
    await env.MY_MEMO_D1.prepare(
      "SELECT COUNT(*) AS count FROM memos WHERE user_id='owner'",
    ).first(),
  ).toEqual({ count: 2 });
  expect(
    await env.MY_MEMO_D1.prepare(
      "SELECT COUNT(*) AS count FROM memo_tags mt JOIN tags t ON t.id=mt.tag_id WHERE t.user_id='owner' AND t.name='移行タグ'",
    ).first(),
  ).toEqual({ count: 1 });
  await page.goto(`${appUrl}/memos/create/bulk`);
  await expect(first.getByLabel("タイトル（必須）")).toHaveValue("");
  await expect(second).toHaveCount(0);
});

test("一括入力のタグ候補は狭い画面でも全候補を選択できる", async ({
  env,
  page,
  appUrl,
}) => {
  await env.MY_MEMO_D1.prepare(
    "INSERT INTO memos (id,user_id,title) VALUES ('suggestions','owner','候補の元メモ')",
  ).run();
  const statements = [];
  for (let index = 0; index < 10; index++) {
    const id = `suggestion-${index}`;
    statements.push(
      env.MY_MEMO_D1.prepare(
        "INSERT INTO tags (id,user_id,name) VALUES (?,'owner',?)",
      ).bind(id, `候補${index}`),
    );
    statements.push(
      env.MY_MEMO_D1.prepare(
        "INSERT INTO memo_tags (memo_id,tag_id) VALUES ('suggestions',?)",
      ).bind(id),
    );
  }
  await env.MY_MEMO_D1.batch(statements);
  await page.setViewportSize({
    width: page.viewportSize()?.width ?? 1059,
    height: 400,
  });
  await page.goto(`${appUrl}/memos/create/bulk`);
  for (let index = 1; index < 10; index++)
    await page.getByRole("button", { name: "行を追加", exact: true }).click();
  const lastRow = page.getByRole("row", { name: "メモ10", exact: true });
  await lastRow.getByRole("combobox", { name: "タグ", exact: true }).click();
  const menu = page.getByRole("listbox");
  await expect(menu).toBeVisible();
  const bounds = await menu.boundingBox();
  expect(bounds?.y).toBeGreaterThanOrEqual(0);
  expect((bounds?.y ?? 0) + (bounds?.height ?? 0)).toBeLessThanOrEqual(400);
  await page.getByRole("option", { name: "#候補9", exact: true }).click();
  await expect(
    lastRow.getByRole("button", { name: "候補9を外す", exact: true }),
  ).toBeVisible();
});

test("GitHub認証で新規・再ログイン・ログアウト・不正stateを処理する", async ({
  env,
  page,
  server,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop");
  await page.context().clearCookies();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    if (request.url === "https://github.com/login/oauth/access_token") {
      return Response.json({
        access_token: "fixed-token",
        token_type: "bearer",
        scope: "read:user,user:email",
      });
    }
    if (request.url === "https://api.github.com/user") {
      return Response.json({
        id: 12345,
        login: "octocat",
        name: "Octo Cat",
        email: null,
        avatar_url: "https://example.test/avatar.png",
      });
    }
    if (request.url === "https://api.github.com/user/emails") {
      return Response.json([
        { email: "octocat@example.com", primary: true, verified: true },
      ]);
    }
    throw new Error(`未定義の外部通信です: ${request.method} ${request.url}`);
  };

  const startLogin = async () => {
    const response = await server.fetch("/api/auth/sign-in/social", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost",
      },
      body: JSON.stringify({ provider: "github", callbackURL: "/" }),
    });
    expect(response.status).toBe(200);
    const { url } = (await response.json()) as { url: string };
    return {
      state: new URL(url).searchParams.get("state"),
      cookie: response.headers
        .getSetCookie()
        .map((value) => value.split(";", 1)[0])
        .join("; "),
    };
  };
  const finishLogin = (state: string | null, cookie: string) =>
    server.fetch(`/api/auth/callback/github?code=fixed-code&state=${state}`, {
      headers: { Cookie: cookie },
      redirect: "manual",
    });

  try {
    const first = await startLogin();
    const callback = await finishLogin(first.state, first.cookie);
    expect(callback.status).toBe(302);
    expect(
      await env.MY_MEMO_D1.prepare(
        "SELECT name,email,plan_id FROM user WHERE email=?",
      )
        .bind("octocat@example.com")
        .first(),
    ).toEqual({
      name: "Octo Cat",
      email: "octocat@example.com",
      plan_id: "free",
    });
    expect(
      await env.MY_MEMO_D1.prepare(
        "SELECT COUNT(*) AS count FROM account WHERE provider_id='github'",
      ).first(),
    ).toEqual({ count: 1 });

    const sessionCookie = callback.headers
      .getSetCookie()
      .map((value) => value.split(";", 1)[0])
      .join("; ");
    const logout = await server.fetch("/api/auth/sign-out", {
      method: "POST",
      headers: {
        Cookie: sessionCookie,
        Origin: "http://localhost",
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    expect(logout.status).toBe(200);
    expect(
      await env.MY_MEMO_D1.prepare(
        "SELECT COUNT(*) AS count FROM session WHERE user_id=(SELECT id FROM user WHERE email=?)",
      )
        .bind("octocat@example.com")
        .first(),
    ).toEqual({ count: 0 });

    const second = await startLogin();
    expect((await finishLogin(second.state, second.cookie)).status).toBe(302);
    expect(
      await env.MY_MEMO_D1.prepare(
        "SELECT COUNT(*) AS count FROM user WHERE email=?",
      )
        .bind("octocat@example.com")
        .first(),
    ).toEqual({ count: 1 });
    expect(
      (await finishLogin("invalid", "")).headers.get("location"),
    ).toContain("error=state_mismatch");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("カテゴリー付きメモと添付を作成・再表示・編集・削除できる", async ({
  appUrl,
  env,
  otherCookie,
  ownerCookie,
  page,
  server,
}) => {
  await page.goto(`${appUrl}/settings/categories`);
  await page.getByLabel("カテゴリー名").fill("仕事");
  await page.getByRole("button", { name: "追加" }).click();
  await expect(page.getByRole("link", { name: "仕事" }).last()).toBeVisible();
  await page.goto(`${appUrl}/memos/create`);
  await page.waitForLoadState("networkidle");
  await page.locator("#memo-title").fill("通しテストのメモ");
  await page.locator("#memo-content").fill("作成した本文");
  await page.getByLabel("カテゴリー").selectOption({ label: "仕事" });
  await page.getByLabel("タグ").fill("確認用");
  await page.getByLabel("タグ").press("Enter");
  await page
    .getByLabel("追加するファイル")
    .setInputFiles({ name: "pixel.png", mimeType: "image/png", buffer: image });
  await expect(page.getByText("pixel.png", { exact: false })).toBeVisible();
  const formState = await page
    .locator('form[action="/api/memos/create"]')
    .evaluate((form: HTMLFormElement) => ({
      valid: form.checkValidity(),
      invalid: [...form.querySelectorAll(":invalid")].map((field) => ({
        name: (field as HTMLInputElement).name,
        value: (field as HTMLInputElement).value,
      })),
      values: [...new FormData(form)].map(([name, value]) => [
        name,
        typeof value === "string" ? value : value.name,
      ]),
    }));
  expect(formState).toMatchObject({ valid: true, invalid: [] });
  await page
    .locator('form[action="/api/memos/create"]')
    .evaluate((form: HTMLFormElement) => form.requestSubmit());
  await expect(
    page.getByRole("heading", { name: "通しテストのメモ" }),
  ).toBeVisible();
  await expect(
    page.getByText("作成した本文").filter({ visible: true }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "仕事" }).last()).toBeVisible();
  await expect(page.getByRole("link", { name: "確認用" })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "pixel.png", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "通しテストのメモ" }),
  ).toBeVisible();

  const memo = await env.MY_MEMO_D1.prepare(
    "SELECT id FROM memos WHERE user_id='owner'",
  ).first<{ id: string }>();
  expect(memo).not.toBeNull();
  const file = await env.MY_MEMO_D1.prepare(
    "SELECT id,r2_key,file_name FROM memo_attachments WHERE memo_id=?",
  )
    .bind(memo?.id)
    .first<{ id: string; r2_key: string; file_name: string }>();
  expect(file?.file_name).toBe("pixel.png");
  expect(await env.MY_MEMO_FILES.get(file?.r2_key ?? "")).not.toBeNull();
  await page.goto(`${appUrl}/settings/files`);
  await page
    .getByRole("combobox", { name: "カテゴリー" })
    .selectOption("uncategorized");
  await expect(page.getByText("ファイルはまだありません。")).toBeVisible();
  await page.getByRole("combobox", { name: "カテゴリー" }).selectOption("");
  await page
    .getByRole("button", { name: "ファイル「pixel.png」の詳細を表示" })
    .click();
  await expect(
    page.getByRole("dialog").getByRole("heading", { name: "pixel.png" }),
  ).toBeVisible();
  const editPath = `/memos/${memo?.id}/edit`;
  await page.getByRole("link", { name: "メモを開く" }).click();
  await expect(page).toHaveURL(
    `${appUrl}${editPath}?returnTo=${encodeURIComponent("/settings/files")}`,
  );
  await expect(
    page.getByRole("textbox", { name: "タイトル", exact: true }),
  ).toHaveValue("通しテストのメモ");
  await page.getByRole("link", { name: "My Memo", exact: true }).click();
  expect(
    (
      await server.fetch(editPath, {
        headers: { Cookie: `better-auth.session_token=${ownerCookie}` },
      })
    ).status,
  ).toBe(200);
  const otherHeaders = { Cookie: `better-auth.session_token=${otherCookie}` };
  expect((await server.fetch(editPath, { headers: otherHeaders })).status).toBe(
    404,
  );
  expect(
    (
      await server.fetch(`/api/attachments/${file?.id}`, {
        headers: { Cookie: `better-auth.session_token=${otherCookie}` },
      })
    ).status,
  ).toBe(404);
  expect(
    (
      await server.fetch(`/api/memos/${memo?.id}`, {
        method: "PATCH",
        headers: {
          ...otherHeaders,
          "Content-Type": "application/json",
          Origin: appUrl,
        },
        body: JSON.stringify({
          title: "他人による変更",
          content: "変更",
          tags: [],
          deleteAttachmentIds: [],
          stagedAttachments: [],
        }),
      })
    ).status,
  ).toBe(404);
  expect(
    await env.MY_MEMO_D1.prepare("SELECT title FROM memos WHERE id=?")
      .bind(memo?.id)
      .first(),
  ).toEqual({ title: "通しテストのメモ" });

  await page.getByRole("link", { name: "編集" }).click();
  await page.waitForLoadState("networkidle");
  await page.locator("#edit-memo-content").fill("編集後の本文");
  await page.locator("#edit-memo-title").fill("編集後のメモ");
  await page.getByRole("button", { name: "更新", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "編集後のメモ" }),
  ).toBeVisible();
  await expect(
    page.getByText("編集後の本文").filter({ visible: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "メモ「編集後のメモ」を削除" })
    .click();
  await page.getByRole("button", { name: "削除", exact: true }).click();
  await expect(page.getByRole("heading", { name: "編集後のメモ" })).toHaveCount(
    0,
  );
  await server
    .getWorker()
    .scheduled({ cron: "*/15 * * * *", scheduledTime: new Date() });
  expect(
    await env.MY_MEMO_D1.prepare("SELECT id FROM memos WHERE id=?")
      .bind(memo?.id)
      .first(),
  ).toBeNull();
  expect(await env.MY_MEMO_FILES.get(file?.r2_key ?? "")).toBeNull();
});
