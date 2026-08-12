import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { getUserCategories } from "./categories";

const db = env.MY_MEMO_D1;

const run = (sql: string, ...values: unknown[]) =>
  db
    .prepare(sql)
    .bind(...values)
    .run();

beforeEach(async () => {
  await db.batch([
    db.prepare("DELETE FROM categories"),
    db.prepare("DELETE FROM user"),
  ]);
  const now = Date.now();
  await run(
    `INSERT INTO user
      (id, name, email, email_verified, role, plan_id, created_at, updated_at)
     VALUES ('owner', 'owner', 'owner@example.com', 1, 'user', 'free', ?, ?)`,
    now,
    now,
  );
});

describe("カテゴリー取得", () => {
  it("保存順位、名前、IDの順で安定して返す", async () => {
    await run(
      `INSERT INTO categories (id, user_id, name, sort_order) VALUES
        ('later', 'owner', '後', 2),
        ('same-b', 'owner', '同順位B', 1),
        ('same-a', 'owner', '同順位A', 1),
        ('first', 'owner', '先', 0)`,
    );

    expect(
      (await getUserCategories(db, "owner")).map((category) => category.id),
    ).toEqual(["first", "same-a", "same-b", "later"]);
  });
});
