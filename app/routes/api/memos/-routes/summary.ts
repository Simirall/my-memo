import { zValidator } from "@hono/zod-validator";
import { and, eq } from "drizzle-orm";
import type { Context } from "hono";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import {
  currentUtcMonthStart,
  getAppDb,
  getEntitlement,
  getUsage,
  PLAN_METRICS,
} from "@/features/access-control/authorization";
import {
  insertMemoWithinQuota,
  releaseAiSummaryQuota,
  reserveAiSummaryQuota,
} from "@/features/access-control/quota";
import { refreshLinkPreviewCacheFromHtml } from "@/features/link-preview/server/link-preview-cache";
import { memoSchema } from "@/features/memos/schema/memo-schema";
import { memosTable } from "@/schema";
import { decodeHtmlEntities } from "../-lib/decode-html-entities";
import {
  generateUrlSummary,
  type SummaryStreamEventWriter,
  type UrlSummaryFailure,
  type UrlSummaryResult,
} from "../-lib/url-summary";

const summaryRoute = new Hono<{ Bindings: CloudflareBindings }>();
type SummaryContext = Context<{ Bindings: CloudflareBindings }>;

const wantsStream = (c: SummaryContext) =>
  c.req.header("Accept")?.includes("text/event-stream") ?? false;

const jsonError = (
  c: SummaryContext,
  code: string,
  message: string,
  status: 406,
) => c.json({ code, message }, status);

summaryRoute.post("/:id/regenerate-summary", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ message: "認証が必要です。" }, 401);

  const memoId = c.req.param("id");
  const db = getAppDb(c.env);
  const memo = await db
    .select({
      content: memosTable.content,
      id: memosTable.id,
      isAiSummary: memosTable.isAiSummary,
      url: memosTable.url,
    })
    .from(memosTable)
    .where(and(eq(memosTable.id, memoId), eq(memosTable.userId, user.id)))
    .get();
  if (!memo) return c.json({ message: "メモが見つかりません。" }, 404);
  if (memo.isAiSummary !== 1 || !memo.url) {
    return c.json({ message: "再要約できるAI要約メモではありません。" }, 409);
  }

  const reservationPeriodStart = currentUtcMonthStart();
  const reserved = await reserveAiSummaryQuota(
    c.env.MY_MEMO_D1,
    user.id,
    reservationPeriodStart,
  );
  if (!reserved) {
    return c.json({ message: "AI要約の今月の上限に達しています。" }, 403);
  }

  let reservationConsumed = false;
  try {
    const generated = await generateUrlSummary(
      c.env,
      memo.url,
      async () => undefined,
    );
    if (!generated.ok) {
      return c.json({ message: generated.message }, 502);
    }

    const updated = await c.env.MY_MEMO_D1.prepare(
      `UPDATE memos
       SET content = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND user_id = ? AND is_ai_summary = 1
         AND url = ? AND content IS ?`,
    )
      .bind(generated.summary, memoId, user.id, memo.url, memo.content)
      .run();
    if (updated.meta.changes !== 1) {
      return c.json({ message: "AI要約を更新できませんでした。" }, 409);
    }

    reservationConsumed = true;
    return c.json({ content: generated.summary });
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "memo_summary_regeneration_failed",
        memoId,
        errorType: error instanceof Error ? error.name : "UnknownError",
      }),
    );
    return c.json({ message: "AI要約を再生成できませんでした。" }, 502);
  } finally {
    if (!reservationConsumed) {
      await releaseAiSummaryQuota(
        c.env.MY_MEMO_D1,
        user.id,
        reservationPeriodStart,
      );
    }
  }
});

summaryRoute.post("/url", zValidator("form", memoSchema.url), async (c) => {
  const user = c.get("user");
  if (!user) return c.redirect("/login");
  if (!wantsStream(c)) {
    return jsonError(
      c,
      "SSE_REQUIRED",
      "URL要約にはSSEに対応したリクエストが必要です。",
      406,
    );
  }

  const validated = c.req.valid("form");
  const url = validated.url;

  return streamSSE(c, async (stream) => {
    const writeEvent: SummaryStreamEventWriter = (event, payload) =>
      stream.writeSSE({
        event,
        data: JSON.stringify(payload),
      });
    const writeError = (failure: UrlSummaryFailure) =>
      stream.writeSSE({
        event: "error",
        data: JSON.stringify(failure),
      });

    try {
      const db = getAppDb(c.env);
      const memoEntitlement = await getEntitlement(
        db,
        user.id,
        PLAN_METRICS.memoTotal,
      );
      const aiEntitlement = await getEntitlement(
        db,
        user.id,
        PLAN_METRICS.aiSummaryMonthly,
      );
      if (!memoEntitlement || !aiEntitlement) {
        await writeError({
          code: "PLAN_CONFIGURATION_ERROR",
          message: "プランの上限設定が不足しています。",
        });
        return;
      }

      const memoUsage = await getUsage(db, user.id, PLAN_METRICS.memoTotal);
      if (
        memoEntitlement.limit !== null &&
        memoUsage >= memoEntitlement.limit
      ) {
        await writeError({
          code: "QUOTA_EXCEEDED",
          message: `メモの上限（${memoEntitlement.limit}件）に達しています。`,
        });
        return;
      }

      const processUrlSummary = async (): Promise<UrlSummaryResult> => {
        const reservationPeriodStart = currentUtcMonthStart();
        const reserved = await reserveAiSummaryQuota(
          c.env.MY_MEMO_D1,
          user.id,
          reservationPeriodStart,
        );
        if (!reserved) {
          return {
            ok: false,
            failure: {
              code: "QUOTA_EXCEEDED",
              message: `AI要約の今月の上限（${aiEntitlement.limit ?? "無制限"}回）に達しています。`,
            },
          };
        }
        let reservationConsumed = false;
        try {
          await writeEvent("status", { message: "要約を生成しています…" });
          const generated = await generateUrlSummary(c.env, url, async (text) =>
            writeEvent("chunk", { text }),
          );
          if (!generated.ok) {
            return {
              ok: false,
              failure: {
                code: "AI_SUMMARY_ERROR",
                message: generated.message,
              },
            };
          }

          await writeEvent("status", { message: "要約を保存しています…" });

          const inserted = await insertMemoWithinQuota(c.env.MY_MEMO_D1, {
            id: crypto.randomUUID(),
            title: decodeHtmlEntities(generated.title || "No Title"),
            content: generated.summary,
            userId: user.id,
            isAiSummary: 1,
            url,
            categoryId: validated.category ?? null,
            tags: validated.tags,
          });
          if (!inserted) {
            return {
              ok: false,
              failure: {
                code: "QUOTA_EXCEEDED",
                message: "メモの上限に達したため、要約を保存できませんでした。",
              },
            };
          }

          await refreshLinkPreviewCacheFromHtml(
            c.env.MY_MEMO_D1,
            url,
            generated.htmlText,
            generated.finalUrl,
          );

          reservationConsumed = true;
          return { ok: true };
        } finally {
          if (!reservationConsumed) {
            await releaseAiSummaryQuota(
              c.env.MY_MEMO_D1,
              user.id,
              reservationPeriodStart,
            );
          }
        }
      };

      await writeEvent("status", { message: "ページを取得しています…" });
      const result = await processUrlSummary();
      if (!result.ok) {
        await writeError(result.failure);
        return;
      }

      await stream.writeSSE({
        event: "complete",
        data: JSON.stringify({ redirect: "/" }),
      });
    } catch {
      await writeError({
        code: "AI_SUMMARY_ERROR",
        message: "AI要約を作成できませんでした。",
      });
    }
  });
});

export default summaryRoute;
