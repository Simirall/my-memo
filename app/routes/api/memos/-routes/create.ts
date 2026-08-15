import { zValidator } from "@hono/zod-validator";
import type { Context } from "hono";
import { Hono } from "hono";
import {
  getAppDb,
  getEntitlement,
  getUsage,
  PLAN_METRICS,
} from "@/features/access-control/authorization";
import { insertMemoWithinQuota } from "@/features/access-control/quota";
import { refreshLinkPreviewCache } from "@/features/link-preview/server/link-preview-cache";
import { memoSchema } from "@/features/memos/schema/memo-schema";

const createRoute = new Hono<{ Bindings: CloudflareBindings }>();
type CreateContext = Context<{ Bindings: CloudflareBindings }>;

const jsonError = (
  c: CreateContext,
  code: string,
  message: string,
  status: 403,
) => c.json({ code, message }, status);

createRoute.post(
  "/create",
  zValidator("form", memoSchema.create),
  async (c) => {
    const user = c.get("user");
    if (!user) return c.redirect("/login");
    const db = getAppDb(c.env);

    const validated = c.req.valid("form");
    const entitlement = await getEntitlement(
      db,
      user.id,
      PLAN_METRICS.memoTotal,
    );
    if (!entitlement) {
      return jsonError(
        c,
        "PLAN_CONFIGURATION_ERROR",
        "プランのメモ上限が設定されていません。",
        403,
      );
    }

    const usage = await getUsage(db, user.id, PLAN_METRICS.memoTotal);
    if (entitlement.limit !== null && usage >= entitlement.limit) {
      return jsonError(
        c,
        "QUOTA_EXCEEDED",
        `メモの上限（${entitlement.limit}件）に達しています。`,
        403,
      );
    }

    const memoId = crypto.randomUUID();
    const inserted = await insertMemoWithinQuota(c.env.MY_MEMO_D1, {
      id: memoId,
      userId: user.id,
      title: validated.title,
      content: validated.content,
      url: validated.url ?? null,
      categoryId: validated.categoryId ?? null,
      isAiSummary: 0,
      tags: validated.tags,
    });
    if (!inserted) {
      return jsonError(
        c,
        "QUOTA_EXCEEDED",
        "メモの上限に達しました。最新の利用状況を確認してください。",
        403,
      );
    }

    const previewUrl = validated.url;
    if (previewUrl) {
      await refreshLinkPreviewCache(c.env.MY_MEMO_D1, previewUrl);
    }

    return c.json({ memoId });
  },
);

export default createRoute;
