import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";

const db = env.MY_MEMO_D1;

async function run(sql: string, ...values: unknown[]) {
  return db
    .prepare(sql)
    .bind(...values)
    .run();
}

async function addUser(id: string, role: "user" | "admin" = "user") {
  const now = Date.now();
  await run(
    `INSERT INTO user
      (id, name, email, email_verified, role, plan_id, created_at, updated_at)
     VALUES (?, ?, ?, 1, ?, 'free', ?, ?)`,
    id,
    id,
    `${id}@example.com`,
    role,
    now,
    now,
  );
}

beforeEach(async () => {
  await db.batch([
    db.prepare("DELETE FROM user"),
    db.prepare("DELETE FROM plan_limits WHERE plan_id <> 'free'"),
    db.prepare("DELETE FROM plans WHERE id <> 'free'"),
  ]);
});

describe("スキーママイグレーション", () => {
  it("Freeプランと必須の利用上限を初期データとして作成する", async () => {
    const plan = await db
      .prepare(
        "SELECT code, name, is_default, is_active FROM plans WHERE id = 'free'",
      )
      .first<{
        code: string;
        name: string;
        is_default: number;
        is_active: number;
      }>();
    const limits = await db
      .prepare(
        "SELECT metric, limit_value FROM plan_limits WHERE plan_id = 'free' ORDER BY metric",
      )
      .all<{ metric: string; limit_value: number }>();

    expect(plan).toEqual({
      code: "free",
      name: "Free",
      is_default: 1,
      is_active: 1,
    });
    expect(limits.results).toEqual([
      { metric: "ai_summary.monthly", limit_value: 10 },
      { metric: "attachment.storage_bytes", limit_value: 524288000 },
      { metric: "memo.total", limit_value: 100 },
    ]);
  });

  it("存在しないプランを持つユーザーを作成させない", async () => {
    await expect(
      run(
        `INSERT INTO user
          (id, name, email, email_verified, plan_id, created_at, updated_at)
         VALUES ('missing', 'missing', 'missing@example.com', 1, NULL, 0, 0)`,
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

  it("ユーザーが参照中のプランを削除させない", async () => {
    await addUser("member");

    await expect(run("DELETE FROM plans WHERE id = 'free'")).rejects.toThrow(
      /cannot delete a plan assigned to a user/,
    );
  });

  it("最後の管理者を降格させない", async () => {
    await addUser("only-admin", "admin");

    await expect(
      run("UPDATE user SET role = 'user' WHERE id = 'only-admin'"),
    ).rejects.toThrow(/cannot demote the last administrator/);
  });

  it("管理者が複数いる場合は降格できる", async () => {
    await addUser("first-admin", "admin");
    await addUser("second-admin", "admin");

    await run("UPDATE user SET role = 'user' WHERE id = 'first-admin'");

    const user = await db
      .prepare("SELECT role FROM user WHERE id = 'first-admin'")
      .first<{ role: string }>();
    expect(user).toEqual({ role: "user" });
  });

  it("カテゴリー順位とすべてからの除外設定を追加する", async () => {
    await addUser("category-owner");
    const columns = await db
      .prepare("PRAGMA table_info('categories')")
      .all<{ name: string; dflt_value: string | null }>();
    const indexes = await db
      .prepare("PRAGMA index_list('categories')")
      .all<{ name: string }>();

    expect(columns.results.map((column) => column.name)).toContain(
      "sort_order",
    );
    expect(columns.results).toContainEqual(
      expect.objectContaining({
        name: "exclude_from_all",
        dflt_value: "false",
      }),
    );
    expect(indexes.results.map((index) => index.name)).toContain(
      "categories_user_id_sort_order_idx",
    );
    await run(
      "INSERT INTO categories (id, user_id, name) VALUES ('existing-category', 'category-owner', '既存')",
    );
    expect(
      await db
        .prepare(
          "SELECT exclude_from_all FROM categories WHERE id = 'existing-category'",
        )
        .first(),
    ).toEqual({ exclude_from_all: 0 });
    await expect(
      run(
        "INSERT INTO categories (id, user_id, name, sort_order) VALUES ('invalid-order', 'category-owner', '不正', -1)",
      ),
    ).rejects.toThrow(/categories_sort_order_non_negative/);
  });
});
