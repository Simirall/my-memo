import { zValidator } from "@hono/zod-validator";
import { and, asc, eq } from "drizzle-orm";
import type { Context } from "hono";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import {
  decodeHtmlEntities,
  decodeHtmlWithCorrectEncoding,
  memoSchema,
  tagUpdateSchema,
} from "@/routes/-features/memos";
import { normalizeTagNames, replaceMemoTags } from "@/routes/-features/tags";
import { memosTable, memoTagsTable, tagsTable } from "@/schema";
import {
  getAppDb,
  getEntitlement,
  getUsage,
  PLAN_METRICS,
} from "@/utils/authorization";
import { insertMemoWithinQuota, reserveAiSummaryQuota } from "@/utils/quota";

const memosRoute = new Hono<{ Bindings: CloudflareBindings }>();
type MemosContext = Context<{ Bindings: CloudflareBindings }>;

const wantsJson = (c: MemosContext) =>
  c.req.header("Accept")?.includes("application/json") ?? false;

const wantsStream = (c: MemosContext) =>
  c.req.header("Accept")?.includes("text/event-stream") ?? false;

const quotaError = (
  c: MemosContext,
  redirectPath: string,
  message: string,
  code = "QUOTA_EXCEEDED",
) => {
  if (wantsJson(c)) {
    return c.json({ code, message }, 403);
  }
  return c.redirect(`${redirectPath}?error=${encodeURIComponent(message)}`);
};

type UrlSummaryFailure = {
  code: string;
  message: string;
  redirect?: string;
};

type UrlSummaryResult =
  | { ok: true }
  | { ok: false; failure: UrlSummaryFailure };

type SummaryStreamPayload = {
  message?: string;
  text?: string;
};

type SummaryStreamEventWriter = (
  event: "chunk" | "status",
  payload: SummaryStreamPayload,
) => Promise<void>;

type WorkersAiChatStreamPayload = {
  response?: unknown;
  choices?: Array<{
    delta?: { content?: unknown };
    message?: { content?: unknown };
  }>;
};

const getWorkersAiChatText = (payload: unknown) => {
  if (!payload || typeof payload !== "object") return "";

  const typedPayload = payload as WorkersAiChatStreamPayload;
  if (typeof typedPayload.response === "string") {
    return typedPayload.response;
  }

  const firstChoice = typedPayload.choices?.[0];
  const deltaContent = firstChoice?.delta?.content;
  if (typeof deltaContent === "string") return deltaContent;

  const messageContent = firstChoice?.message?.content;
  return typeof messageContent === "string" ? messageContent : "";
};

const readWorkersAiChatStream = async (
  aiStream: ReadableStream,
  onText: (text: string) => Promise<void>,
) => {
  const reader = aiStream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let summary = "";

  const emitData = async (data: string) => {
    const trimmed = data.trim();
    if (!trimmed || trimmed === "[DONE]") return;

    let payload: unknown;
    try {
      payload = JSON.parse(trimmed);
    } catch {
      return;
    }

    const text = getWorkersAiChatText(payload);
    if (!text) return;

    summary += text;
    await onText(text);
  };

  const emitEvent = async (event: string) => {
    const data = event
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice("data:".length).trimStart())
      .join("\n");
    await emitData(data);
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      if (value instanceof Uint8Array) {
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split(/\r?\n\r?\n/);
        buffer = events.pop() ?? "";
        for (const event of events) {
          await emitEvent(event);
        }
        continue;
      }

      const text = getWorkersAiChatText(value);
      if (text) {
        summary += text;
        await onText(text);
      }
    }

    buffer += decoder.decode();
    if (buffer.trim()) await emitEvent(buffer);
  } finally {
    reader.releaseLock();
  }

  return summary;
};

memosRoute
  .post("/create", zValidator("form", memoSchema.create), async (c) => {
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
      return quotaError(
        c,
        "/memos/create",
        "プランのメモ上限が設定されていません。",
        "PLAN_CONFIGURATION_ERROR",
      );
    }

    const usage = await getUsage(db, user.id, PLAN_METRICS.memoTotal);
    if (entitlement.limit !== null && usage >= entitlement.limit) {
      return quotaError(
        c,
        "/memos/create",
        `メモの上限（${entitlement.limit}件）に達しています。`,
      );
    }

    const inserted = await insertMemoWithinQuota(c.env.MY_MEMO_D1, {
      id: crypto.randomUUID(),
      userId: user.id,
      title: validated.title,
      content: validated.content,
      url: validated.url ?? null,
      categoryId: validated.categoryId ?? null,
      aiGenerated: 0,
      tags: validated.tags,
    });
    if (!inserted) {
      return quotaError(
        c,
        "/memos/create",
        "メモの上限に達しました。最新の利用状況を確認してください。",
      );
    }

    return c.redirect("/");
  })
  .post("/delete/:id", async (c) => {
    const user = c.get("user");
    if (!user) return c.redirect("/login");
    const memoId = c.req.param("id");
    const db = getAppDb(c.env);

    const memo = await db
      .select()
      .from(memosTable)
      .where(and(eq(memosTable.userId, user.id), eq(memosTable.id, memoId)))
      .get();

    if (memo) {
      await db
        .delete(memosTable)
        .where(and(eq(memosTable.userId, user.id), eq(memosTable.id, memoId)));
    }

    return c.redirect("/");
  })
  .post("/:id/tags", zValidator("json", tagUpdateSchema), async (c) => {
    const user = c.get("user");
    if (!user) return c.json({ message: "認証が必要です。" }, 401);

    const memoId = c.req.param("id");
    const db = getAppDb(c.env);
    const memo = await db
      .select({ id: memosTable.id })
      .from(memosTable)
      .where(and(eq(memosTable.id, memoId), eq(memosTable.userId, user.id)))
      .get();
    if (!memo) return c.json({ message: "メモが見つかりません。" }, 404);

    const validated = c.req.valid("json");
    const normalized = normalizeTagNames(validated.tags);
    if (!normalized.ok) return c.json({ message: normalized.message }, 400);

    await replaceMemoTags(c.env.MY_MEMO_D1, memoId, user.id, normalized.names);
    const tags = await db
      .select({ id: tagsTable.id, name: tagsTable.name })
      .from(tagsTable)
      .innerJoin(memoTagsTable, eq(memoTagsTable.tagId, tagsTable.id))
      .where(
        and(eq(memoTagsTable.memoId, memoId), eq(tagsTable.userId, user.id)),
      )
      .orderBy(asc(tagsTable.name));

    return c.json({ tags });
  })
  .post("/url", zValidator("form", memoSchema.url), async (c) => {
    const user = c.get("user");
    if (!user) return c.redirect("/login");
    const db = getAppDb(c.env);

    const validated = c.req.valid("form");
    const url = validated.url;

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
      return quotaError(
        c,
        "/memos/url-summary",
        "プランの上限設定が不足しています。",
        "PLAN_CONFIGURATION_ERROR",
      );
    }

    const memoUsage = await getUsage(db, user.id, PLAN_METRICS.memoTotal);
    if (memoEntitlement.limit !== null && memoUsage >= memoEntitlement.limit) {
      return quotaError(
        c,
        "/memos/url-summary",
        `メモの上限（${memoEntitlement.limit}件）に達しています。`,
      );
    }

    const processUrlSummary = async (
      writeEvent?: SummaryStreamEventWriter,
    ): Promise<UrlSummaryResult> => {
      const response = await fetch(url);

      // HTMLを正しいエンコーディングでデコード
      const htmlText = await decodeHtmlWithCorrectEncoding(response);

      // UTF-8のBlobとして再生成してAIに渡す
      const utf8Blob = new Blob([htmlText], {
        type: "text/html; charset=utf-8",
      });

      const reserved = await reserveAiSummaryQuota(c.env.MY_MEMO_D1, user.id);
      if (!reserved) {
        return {
          ok: false,
          failure: {
            code: "QUOTA_EXCEEDED",
            message: `AI要約の今月の上限（${aiEntitlement.limit ?? "無制限"}回）に達しています。`,
          },
        };
      }

      const [markdown] = await c.env.AI.toMarkdown([
        {
          name: url,
          blob: utf8Blob,
        },
      ]);

      if (markdown.format === "error") {
        return {
          ok: false,
          failure: {
            code: "AI_SUMMARY_ERROR",
            message: "ページを要約できませんでした。",
            redirect: "/",
          },
        };
      }

      const m = markdown.data.match(/\s*title:\s*(?<title>.+?)\s*\n[\s\S]*?/m);
      const title = m?.groups?.title;
      const messages = [
        {
          role: "user" as const,
          content:
            "以下の内容を、日本語で200文字程度の概要と2~5個の箇条書きで、markdown形式にまとめてください。出力形式は概要と箇条書きのみで、タイトルセクション等は含めないでください。\n\n" +
            markdown.data,
        },
      ];

      if (writeEvent) {
        await writeEvent("status", { message: "要約を生成しています…" });
      }

      const summary = writeEvent
        ? await readWorkersAiChatStream(
            await c.env.AI.run("@cf/google/gemma-4-26b-a4b-it", {
              messages,
              stream: true,
            }),
            async (text) => writeEvent("chunk", { text }),
          )
        : (
            await c.env.AI.run("@cf/google/gemma-4-26b-a4b-it", {
              messages,
            })
          ).choices[0]?.message.content;

      if (!summary) {
        return {
          ok: false,
          failure: {
            code: "AI_SUMMARY_ERROR",
            message: "AI要約を作成できませんでした。",
            redirect: "/",
          },
        };
      }

      if (writeEvent) {
        await writeEvent("status", { message: "要約を保存しています…" });
      }

      const inserted = await insertMemoWithinQuota(c.env.MY_MEMO_D1, {
        id: crypto.randomUUID(),
        title: decodeHtmlEntities(title || "No Title"),
        content: summary,
        userId: user.id,
        aiGenerated: 1,
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

      return { ok: true };
    };

    if (wantsStream(c)) {
      return streamSSE(c, async (stream) => {
        const writeEvent: SummaryStreamEventWriter = (event, payload) =>
          stream.writeSSE({
            event,
            data: JSON.stringify(payload),
          });

        try {
          await writeEvent("status", { message: "ページを取得しています…" });
          const result = await processUrlSummary(writeEvent);
          if (!result.ok) {
            await stream.writeSSE({
              event: "error",
              data: JSON.stringify(result.failure),
            });
            return;
          }

          await stream.writeSSE({
            event: "complete",
            data: JSON.stringify({ redirect: "/" }),
          });
        } catch {
          await stream.writeSSE({
            event: "error",
            data: JSON.stringify({
              code: "AI_SUMMARY_ERROR",
              message: "AI要約を作成できませんでした。",
            }),
          });
        }
      });
    }

    const result = await processUrlSummary();
    if (!result.ok) {
      if (result.failure.redirect) return c.redirect(result.failure.redirect);
      return quotaError(
        c,
        "/memos/url-summary",
        result.failure.message,
        result.failure.code,
      );
    }

    return c.redirect("/");
  });

export default memosRoute;
