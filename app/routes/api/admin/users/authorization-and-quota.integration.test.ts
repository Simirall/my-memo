import { env } from "cloudflare:workers";
import { Hono } from "hono";
import { beforeEach, describe, expect, it } from "vitest";
import {
  currentUtcMonthStart,
  getAppDb,
  getEntitlement,
  getPlanUsage,
  getUsage,
  PLAN_METRICS,
} from "@/features/access-control/authorization";
import {
  insertMemoWithinQuota,
  reserveAiSummaryQuota,
} from "@/features/access-control/quota";
import usersRoute from "./index";

const db = env.MY_MEMO_D1;

async function run(sql: string, ...values: unknown[]) {
  return db
    .prepare(sql)
    .bind(...values)
    .run();
}

async function addPlan(
  id: string,
  memoLimit: number | null | undefined,
  aiLimit: number | null | undefined,
) {
  await run(
    "INSERT INTO plans (id, code, name, is_default, is_active) VALUES (?, ?, ?, 0, 1)",
    id,
    id,
    id,
  );
  if (memoLimit !== undefined) {
    await run(
      "INSERT INTO plan_limits (plan_id, metric, limit_value) VALUES (?, 'memo.total', ?)",
      id,
      memoLimit,
    );
  }
  if (aiLimit !== undefined) {
    await run(
      "INSERT INTO plan_limits (plan_id, metric, limit_value) VALUES (?, 'ai_summary.monthly', ?)",
      id,
      aiLimit,
    );
  }
}

async function addUser(
  id: string,
  options: { planId?: string; role?: "user" | "admin" } = {},
) {
  const now = Date.now();
  await run(
    `INSERT INTO user
      (id, name, email, email_verified, role, plan_id, created_at, updated_at)
     VALUES (?, ?, ?, 1, ?, ?, ?, ?)`,
    id,
    id,
    `${id}@example.com`,
    options.role ?? "user",
    options.planId ?? "free",
    now,
    now,
  );
}

async function memoCount(userId: string) {
  const row = await db
    .prepare("SELECT COUNT(*) AS count FROM memos WHERE user_id = ?")
    .bind(userId)
    .first<{ count: number }>();
  return Number(row?.count ?? 0);
}

beforeEach(async () => {
  await db.batch([
    db.prepare("DELETE FROM authorization_audit_logs"),
    db.prepare("DELETE FROM usage_counters"),
    db.prepare("DELETE FROM memo_attachments"),
    db.prepare("DELETE FROM memo_tags"),
    db.prepare("DELETE FROM memos"),
    db.prepare("DELETE FROM tags"),
    db.prepare("DELETE FROM categories"),
    db.prepare("DELETE FROM account"),
    db.prepare("DELETE FROM session"),
    db.prepare("DELETE FROM user"),
    db.prepare("DELETE FROM plan_limits WHERE plan_id <> 'free'"),
    db.prepare("DELETE FROM plans WHERE id <> 'free'"),
    db.prepare(
      "UPDATE plan_limits SET limit_value = 100 WHERE plan_id = 'free' AND metric = 'memo.total'",
    ),
    db.prepare(
      "UPDATE plan_limits SET limit_value = 10 WHERE plan_id = 'free' AND metric = 'ai_summary.monthly'",
    ),
    db.prepare(
      "UPDATE plan_limits SET limit_value = 524288000 WHERE plan_id = 'free' AND metric = 'attachment.storage_bytes'",
    ),
  ]);
});

describe("マイグレーションとプラン設定", () => {
  it("freeプランと必須の利用上限を初期データとして作成する", async () => {
    const plan = await db
      .prepare(
        "SELECT code, is_default, is_active FROM plans WHERE id = 'free'",
      )
      .first<{ code: string; is_default: number; is_active: number }>();
    const limits = await db
      .prepare(
        "SELECT metric, limit_value FROM plan_limits WHERE plan_id = 'free' ORDER BY metric",
      )
      .all<{ metric: string; limit_value: number }>();

    expect(plan).toEqual({ code: "free", is_default: 1, is_active: 1 });
    expect(limits.results).toEqual([
      { metric: "ai_summary.monthly", limit_value: 10 },
      { metric: "attachment.storage_bytes", limit_value: 524288000 },
      { metric: "memo.total", limit_value: 100 },
    ]);
  });

  it("新規ユーザーを一般権限にし、有効なプランがないユーザーは作成させない", async () => {
    await addUser("member");
    const member = await db
      .prepare("SELECT role, plan_id FROM user WHERE id = 'member'")
      .first<{ role: string; plan_id: string }>();
    expect(member).toEqual({ role: "user", plan_id: "free" });

    await expect(
      run(
        `INSERT INTO user
          (id, name, email, email_verified, plan_id, created_at, updated_at)
         VALUES ('invalid', 'invalid', 'invalid@example.com', 1, NULL, 0, 0)`,
      ),
    ).rejects.toThrow(/NOT NULL constraint failed/);

    await expect(
      run(
        `INSERT INTO user
          (id, name, email, email_verified, plan_id, created_at, updated_at)
         VALUES ('unknown', 'unknown', 'unknown@example.com', 1, 'unknown', 0, 0)`,
      ),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/);
  });

  it("上限が未定義の機能は利用不可とし、NULLの上限は無制限として扱う", async () => {
    await addPlan("missing", undefined, 1);
    await addPlan("unlimited", null, null);
    await addUser("missing-user", { planId: "missing" });
    await addUser("unlimited-user", { planId: "unlimited" });
    const appDb = getAppDb(env);

    expect(
      await getEntitlement(appDb, "missing-user", PLAN_METRICS.memoTotal),
    ).toBeNull();
    expect(
      await getEntitlement(appDb, "unlimited-user", PLAN_METRICS.memoTotal),
    ).toMatchObject({ limit: null, planCode: "unlimited" });
  });
});

describe("使用量の集計と上限の適用", () => {
  it("現在の使用量を返し、UTC基準で前月のAI使用量を含めない", async () => {
    await addUser("usage-user");
    // 物理リセットはせず、period_startが現在月と一致する行だけを集計する。
    await run(
      "INSERT INTO memos (id, user_id, title, content) VALUES ('memo-1', 'usage-user', 't', 'c')",
    );
    await run(
      `INSERT INTO usage_counters (user_id, metric, period_start, used)
       VALUES ('usage-user', 'ai_summary.monthly', '2000-01-01', 99)`,
    );
    const appDb = getAppDb(env);

    expect(await getUsage(appDb, "usage-user", PLAN_METRICS.memoTotal)).toBe(1);
    expect(
      await getUsage(appDb, "usage-user", PLAN_METRICS.aiSummaryMonthly),
    ).toBe(0);
    expect(await getPlanUsage(appDb, "usage-user")).toMatchObject({
      planCode: "free",
      memo: { used: 1, limit: 100 },
      aiSummary: { used: 0, limit: 10 },
      aiSummaryPeriod: currentUtcMonthStart(),
    });
  });

  it("残り1件のときにメモを同時作成しても成功は1件だけになる", async () => {
    await addPlan("one-memo", 1, 10);
    await addUser("memo-user", { planId: "one-memo" });

    // 上限確認とINSERTが分離されていると、両方が成功する競合を再現する。
    const results = await Promise.all(
      ["a", "b"].map((id) =>
        insertMemoWithinQuota(db, {
          id,
          userId: "memo-user",
          title: id,
          content: id,
          url: null,
          categoryId: null,
          isAiSummary: 0,
        }),
      ),
    );

    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await memoCount("memo-user")).toBe(1);
  });

  it("下位プラン変更後も既存メモを保持し、上限未満になるまで新規作成を止める", async () => {
    await addPlan("one-memo", 1, 10);
    await addPlan("unlimited", null, null);
    await addUser("memo-user", { planId: "unlimited" });
    for (const id of ["a", "b"]) {
      expect(
        await insertMemoWithinQuota(db, {
          id,
          userId: "memo-user",
          title: id,
          content: id,
          url: null,
          categoryId: null,
          isAiSummary: 0,
        }),
      ).toBe(true);
    }

    await run("UPDATE user SET plan_id = 'one-memo' WHERE id = 'memo-user'");
    expect(
      await insertMemoWithinQuota(db, {
        id: "c",
        userId: "memo-user",
        title: "c",
        content: "c",
        url: null,
        categoryId: null,
        isAiSummary: 0,
      }),
    ).toBe(false);

    await run("DELETE FROM memos WHERE id = 'a'");
    expect(await memoCount("memo-user")).toBe(1);
    await run("DELETE FROM memos WHERE id = 'b'");
    expect(
      await insertMemoWithinQuota(db, {
        id: "c",
        userId: "memo-user",
        title: "c",
        content: "c",
        url: null,
        categoryId: null,
        isAiSummary: 0,
      }),
    ).toBe(true);
  });

  it("AI要約を同時に予約しても月次の残り回数を超えて確保しない", async () => {
    await addPlan("two-ai", 100, 2);
    await addUser("ai-user", { planId: "two-ai" });

    // AI呼び出し前の予約処理が競合しても、利用枠を超えないことを保証する。
    const results = await Promise.all(
      Array.from({ length: 5 }, () => reserveAiSummaryQuota(db, "ai-user")),
    );
    expect(results.filter(Boolean)).toHaveLength(2);

    const counter = await db
      .prepare(
        `SELECT used FROM usage_counters
         WHERE user_id = 'ai-user' AND metric = 'ai_summary.monthly' AND period_start = ?`,
      )
      .bind(currentUtcMonthStart())
      .first<{ used: number }>();
    expect(counter?.used).toBe(2);
  });

  it("AI要約の上限NULLは無制限とし、上限未定義なら予約を拒否する", async () => {
    await addPlan("unlimited", null, null);
    await addPlan("missing-ai", 100, undefined);
    await addUser("unlimited-user", { planId: "unlimited" });
    await addUser("missing-user", { planId: "missing-ai" });

    const reservations = await Promise.all(
      Array.from({ length: 12 }, () =>
        reserveAiSummaryQuota(db, "unlimited-user"),
      ),
    );
    expect(reservations.every(Boolean)).toBe(true);
    expect(await reserveAiSummaryQuota(db, "missing-user")).toBe(false);
  });
});

describe("管理者によるユーザー権限管理", () => {
  function adminApp(user: { id: string } | null) {
    const app = new Hono<{ Bindings: CloudflareBindings }>();
    app.use("*", async (c, next) => {
      c.set("user", user as never);
      c.set("session", null);
      await next();
    });
    app.route("/", usersRoute);
    return app;
  }

  function updateRequest(
    targetId: string,
    role: string,
    planId = "free",
    acceptJson = true,
  ) {
    return new Request(`https://example.test/${targetId}`, {
      method: "POST",
      headers: {
        ...(acceptJson ? { Accept: "application/json" } : {}),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ role, planId }),
    });
  }

  it("未認証ユーザーと一般ユーザーからの権限変更を拒否する", async () => {
    await addUser("member");
    await addUser("target");

    expect(
      (await adminApp(null).fetch(updateRequest("target", "admin"), env))
        .status,
    ).toBe(401);
    expect(
      (
        await adminApp({ id: "member" }).fetch(
          updateRequest("target", "admin"),
          env,
        )
      ).status,
    ).toBe(403);
  });

  it("権限とプランを変更し、変更前後の値を監査ログへ1件記録する", async () => {
    await addPlan("pro", 1000, 100);
    await addUser("actor", { role: "admin" });
    await addUser("target");

    const response = await adminApp({ id: "actor" }).fetch(
      updateRequest("target", "admin", "pro"),
      env,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });

    const target = await db
      .prepare("SELECT role, plan_id FROM user WHERE id = 'target'")
      .first<{ role: string; plan_id: string }>();
    const audit = await db
      .prepare(
        "SELECT actor_user_id, target_user_id, action, previous_value, current_value FROM authorization_audit_logs",
      )
      .first<Record<string, string>>();
    expect(target).toEqual({ role: "admin", plan_id: "pro" });
    expect(audit).toMatchObject({
      actor_user_id: "actor",
      target_user_id: "target",
      action: "user_access_changed",
      previous_value: JSON.stringify({ role: "user", planId: "free" }),
      current_value: JSON.stringify({ role: "admin", planId: "pro" }),
    });
  });

  it("成功時はAcceptヘッダーがなくてもJSONを返す", async () => {
    await addUser("actor", { role: "admin" });
    await addUser("target");

    const response = await adminApp({ id: "actor" }).fetch(
      updateRequest("target", "admin", "free", false),
      env,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("application/json");
    expect(await response.json()).toEqual({ ok: true });
  });

  it("最後の管理者は降格させず、失敗した変更を監査ログに残さない", async () => {
    await addUser("only-admin", { role: "admin" });

    const response = await adminApp({ id: "only-admin" }).fetch(
      updateRequest("only-admin", "user"),
      env,
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "LAST_ADMIN" });
    expect(
      await db
        .prepare("SELECT role FROM user WHERE id = 'only-admin'")
        .first("role"),
    ).toBe("admin");
    expect(
      await db
        .prepare("SELECT COUNT(*) AS count FROM authorization_audit_logs")
        .first("count"),
    ).toBe(0);
  });
});
