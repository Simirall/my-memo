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
          configPath: "wrangler.jsonc",
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
  const editPath = `/memos/${memo?.id}/edit`;
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
