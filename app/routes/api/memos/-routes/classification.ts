import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import {
  currentUtcMonthStart,
  getAppDb,
  getEntitlement,
  getUsage,
  PLAN_METRICS,
} from "@/features/access-control/authorization";
import {
  releaseAiSuggestionQuota,
  reserveAiSuggestionQuota,
} from "@/features/access-control/quota";
import {
  memoClassificationInputSchema,
  NoClassificationCandidatesError,
  suggestMemoClassification,
} from "@/features/memos/classification/ai-suggestion";

const route = new Hono<{ Bindings: CloudflareBindings }>();

route.post(
  "/suggest-classification",
  zValidator("json", memoClassificationInputSchema),
  async (c) => {
    const user = c.get("user");
    if (!user) return c.json({ message: "認証が必要です。" }, 401);
    const input = c.req.valid("json");
    if (!input.title.trim() && !input.content.trim()) {
      return c.json({ message: "タイトルまたは本文を入力してください。" }, 400);
    }

    const periodStart = currentUtcMonthStart();
    const reserved = await reserveAiSuggestionQuota(
      c.env.MY_MEMO_D1,
      user.id,
      periodStart,
    );
    if (!reserved) {
      return c.json(
        { message: "AIサジェストの今月の上限に達しています。" },
        403,
      );
    }

    let consumed = false;
    try {
      const suggestion = await suggestMemoClassification(c.env, user.id, input);
      consumed = true;
      const entitlement = await getEntitlement(
        getAppDb(c.env),
        user.id,
        PLAN_METRICS.aiSuggestionMonthly,
      );
      const used = await getUsage(
        getAppDb(c.env),
        user.id,
        PLAN_METRICS.aiSuggestionMonthly,
      );
      return c.json({
        ...suggestion,
        usage: { used, limit: entitlement?.limit ?? null },
      });
    } catch (error) {
      if (error instanceof NoClassificationCandidatesError) {
        return c.json({ message: error.message }, 400);
      }
      return c.json({ message: "AIサジェストを取得できませんでした。" }, 502);
    } finally {
      if (!consumed) {
        await releaseAiSuggestionQuota(c.env.MY_MEMO_D1, user.id, periodStart);
      }
    }
  },
);

export default route;
