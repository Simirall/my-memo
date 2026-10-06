import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import z from "zod";
import {
  getAppDb,
  getEntitlement,
  PLAN_METRICS,
} from "@/features/access-control/authorization";
import { insertMemoWithinQuota } from "@/features/access-control/quota";
import { refreshLinkPreviewCache } from "@/features/link-preview/server/link-preview-cache";
import { memoBulkSchema } from "@/features/memos/schema/memo-input-schema";
import { readLimitedJson } from "@/routes/api/memos/-lib/read-limited-json";
import { categoriesTable, memosTable } from "@/schema";

const bulkRoute = new Hono<{ Bindings: CloudflareBindings }>();

bulkRoute.put("/bulk/:memoId", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ message: "認証が必要です。" }, 401);
  const memoId = c.req.param("memoId");
  if (!z.uuid().safeParse(memoId).success) {
    return c.json({ message: "メモIDが不正です。" }, 400);
  }
  const body = await readLimitedJson(c.req.raw, 64 * 1024);
  if (!body.ok) {
    return c.json(
      {
        message:
          body.reason === "too_large"
            ? "入力内容が大きすぎます。"
            : "入力内容が不正です。",
      },
      body.reason === "too_large" ? 413 : 400,
    );
  }
  const db = getAppDb(c.env);
  const existingMemoResponse = async () => {
    const memo = await db
      .select({ userId: memosTable.userId })
      .from(memosTable)
      .where(eq(memosTable.id, memoId))
      .get();
    if (!memo) return undefined;
    return memo.userId === user.id
      ? c.json({ memoId })
      : c.json({ message: "このメモIDは使用できません。" }, 409);
  };
  const existing = await existingMemoResponse();
  if (existing) return existing;
  const parsed = memoBulkSchema.safeParse(body.value);
  if (!parsed.success) {
    return c.json(
      {
        saved: false,
        message: parsed.error.issues[0]?.message ?? "入力内容が不正です。",
      },
      400,
    );
  }
  const input = parsed.data;
  if (input.categoryId) {
    const category = await db
      .select({ id: categoriesTable.id })
      .from(categoriesTable)
      .where(
        and(
          eq(categoriesTable.id, input.categoryId),
          eq(categoriesTable.userId, user.id),
        ),
      )
      .get();
    if (!category)
      return c.json(
        { saved: false, message: "カテゴリーが見つかりません。" },
        400,
      );
  }
  const entitlement = await getEntitlement(db, user.id, PLAN_METRICS.memoTotal);
  if (!entitlement) {
    return c.json(
      {
        code: "PLAN_CONFIGURATION_ERROR",
        saved: false,
        message: "プランのメモ上限が設定されていません。",
      },
      403,
    );
  }
  try {
    const inserted = await insertMemoWithinQuota(c.env.MY_MEMO_D1, {
      id: memoId,
      userId: user.id,
      title: input.title,
      content: input.content,
      url: input.url ?? null,
      categoryId: input.categoryId ?? null,
      tags: input.tags,
      isAiSummary: 0,
    });
    if (!inserted) {
      // 同じIDの別リクエストが最後のクォータ枠を使った場合も成功として扱う。
      const concurrent = await existingMemoResponse();
      if (concurrent) return concurrent;
      return c.json(
        {
          saved: false,
          code: "QUOTA_EXCEEDED",
          message: "メモの上限に達しました。",
        },
        403,
      );
    }
  } catch {
    // 一意制約の競合ではバッチ全体がロールバックされる。成功した方の結果を返す。
    const concurrent = await existingMemoResponse();
    if (concurrent) return concurrent;
    console.error(JSON.stringify({ event: "memo_bulk_failed", memoId }));
    return c.json(
      { message: "保存できませんでした。同じ行で再試行してください。" },
      500,
    );
  }
  if (input.url)
    c.executionCtx.waitUntil(
      refreshLinkPreviewCache(c.env.MY_MEMO_D1, input.url),
    );
  return c.json({ memoId });
});

export default bulkRoute;
