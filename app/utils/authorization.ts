import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import {
  memoAttachmentsTable,
  memosTable,
  memoTagsTable,
  planLimitsTable,
  plansTable,
  shareIntakeFilesTable,
  shareIntakesTable,
  tagsTable,
  usageCountersTable,
  userTable,
} from "../schema";

export const PLAN_METRICS = {
  memoTotal: "memo.total",
  aiSummaryMonthly: "ai_summary.monthly",
  attachmentStorageBytes: "attachment.storage_bytes",
} as const;

export type PlanMetric = (typeof PLAN_METRICS)[keyof typeof PLAN_METRICS];
export type AppDb = ReturnType<typeof getAppDb>;

export const getAppDb = (env: Cloudflare.Env) =>
  drizzle(env.MY_MEMO_D1, {
    schema: {
      memoAttachmentsTable,
      memosTable,
      planLimitsTable,
      plansTable,
      memoTagsTable,
      shareIntakeFilesTable,
      shareIntakesTable,
      tagsTable,
      usageCountersTable,
      userTable,
    },
  });

export type Entitlement = {
  metric: PlanMetric;
  planId: string;
  planCode: string;
  planName: string;
  limit: number | null;
};

export async function getEntitlement(
  db: AppDb,
  userId: string,
  metric: PlanMetric,
): Promise<Entitlement | null> {
  const result = await db
    .select({
      metric: planLimitsTable.metric,
      planId: plansTable.id,
      planCode: plansTable.code,
      planName: plansTable.name,
      limit: planLimitsTable.limitValue,
    })
    .from(userTable)
    .innerJoin(plansTable, eq(plansTable.id, userTable.planId))
    .innerJoin(
      planLimitsTable,
      and(
        eq(planLimitsTable.planId, plansTable.id),
        eq(planLimitsTable.metric, metric),
      ),
    )
    .where(eq(userTable.id, userId))
    .get();

  if (!result) return null;
  return { ...result, metric: result.metric as PlanMetric };
}

export function currentUtcMonthStart(date = new Date()): string {
  return `${date.toISOString().slice(0, 7)}-01`;
}

export async function getUsage(
  db: AppDb,
  userId: string,
  metric: PlanMetric,
): Promise<number> {
  if (metric === PLAN_METRICS.memoTotal) {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(memosTable)
      .where(eq(memosTable.userId, userId))
      .get();
    return Number(result?.count ?? 0);
  }

  if (metric === PLAN_METRICS.attachmentStorageBytes) {
    const result = await db
      .select({
        total: sql<number>`coalesce(sum(${memoAttachmentsTable.sizeBytes}), 0)`,
      })
      .from(memoAttachmentsTable)
      .where(eq(memoAttachmentsTable.userId, userId))
      .get();
    return Number(result?.total ?? 0);
  }

  const result = await db
    .select({ used: usageCountersTable.used })
    .from(usageCountersTable)
    .where(
      and(
        eq(usageCountersTable.userId, userId),
        eq(usageCountersTable.metric, metric),
        eq(usageCountersTable.periodStart, currentUtcMonthStart()),
      ),
    )
    .get();
  return result?.used ?? 0;
}

export async function getPlanUsage(db: AppDb, userId: string) {
  const memo = await getEntitlement(db, userId, PLAN_METRICS.memoTotal);
  const aiSummary = await getEntitlement(
    db,
    userId,
    PLAN_METRICS.aiSummaryMonthly,
  );
  const attachmentStorage = await getEntitlement(
    db,
    userId,
    PLAN_METRICS.attachmentStorageBytes,
  );

  if (!memo || !aiSummary || !attachmentStorage) return null;

  const [memoUsed, aiSummaryUsed, attachmentStorageUsed] = await Promise.all([
    getUsage(db, userId, PLAN_METRICS.memoTotal),
    getUsage(db, userId, PLAN_METRICS.aiSummaryMonthly),
    getUsage(db, userId, PLAN_METRICS.attachmentStorageBytes),
  ]);

  return {
    planId: memo.planId,
    planCode: memo.planCode,
    planName: memo.planName,
    memo: { used: memoUsed, limit: memo.limit },
    aiSummary: { used: aiSummaryUsed, limit: aiSummary.limit },
    attachmentStorage: {
      used: attachmentStorageUsed,
      limit: attachmentStorage.limit,
    },
    aiSummaryPeriod: currentUtcMonthStart(),
  };
}

export async function getFreshUser(db: AppDb, userId: string) {
  return db
    .select({
      id: userTable.id,
      role: userTable.role,
      planId: userTable.planId,
      name: userTable.name,
      email: userTable.email,
    })
    .from(userTable)
    .where(eq(userTable.id, userId))
    .get();
}

if (import.meta.vitest) {
  const { describe, expect, it } = import.meta.vitest;

  describe("AI要約の月次集計期間", () => {
    it("日本時間では月が替わっていてもUTC基準で集計月を判定する", () => {
      expect(currentUtcMonthStart(new Date("2026-04-30T15:00:00+09:00"))).toBe(
        "2026-04-01",
      );
      expect(currentUtcMonthStart(new Date("2026-05-01T08:59:59+09:00"))).toBe(
        "2026-04-01",
      );
      expect(currentUtcMonthStart(new Date("2026-05-01T09:00:00+09:00"))).toBe(
        "2026-05-01",
      );
    });
  });
}
