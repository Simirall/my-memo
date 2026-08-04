import { zValidator } from "@hono/zod-validator";
import { and, asc, eq } from "drizzle-orm";
import type { Context } from "hono";
import { Hono } from "hono";
import { memosTable, memoTagsTable, tagsTable } from "../../../schema";
import {
  getAppDb,
  getEntitlement,
  getUsage,
  PLAN_METRICS,
} from "../../../utils/authorization";
import { decodeHtmlEntities } from "../../../utils/decodeHtmlEntities";
import { decodeHtmlWithCorrectEncoding } from "../../../utils/decodeHtmlWithCorrectEncoding";
import {
  insertMemoWithinQuota,
  reserveAiSummaryQuota,
} from "../../../utils/quota";
import { normalizeTagNames, replaceMemoTags } from "../../../utils/tags";
import { memoSchema, tagUpdateSchema } from "./memoSchema";

const memosRoute = new Hono<{ Bindings: CloudflareBindings }>();
type MemosContext = Context<{ Bindings: CloudflareBindings }>;

const wantsJson = (c: MemosContext) =>
  c.req.header("Accept")?.includes("application/json") ?? false;

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

    const response = await fetch(url);

    // HTMLを正しいエンコーディングでデコード
    const htmlText = await decodeHtmlWithCorrectEncoding(response);

    // UTF-8のBlobとして再生成してAIに渡す
    const utf8Blob = new Blob([htmlText], { type: "text/html; charset=utf-8" });

    const reserved = await reserveAiSummaryQuota(c.env.MY_MEMO_D1, user.id);
    if (!reserved) {
      return quotaError(
        c,
        "/memos/url-summary",
        `AI要約の今月の上限（${aiEntitlement.limit ?? "無制限"}回）に達しています。`,
      );
    }

    const [markdown] = await c.env.AI.toMarkdown([
      {
        name: url,
        blob: utf8Blob,
      },
    ]);

    if (markdown.format === "error") {
      return c.redirect("/");
    }

    const m = markdown.data.match(/\s*title:\s*(?<title>.+?)\s*\n[\s\S]*?/m);
    const title = m?.groups?.title;

    const summaryResponse = await c.env.AI.run("@cf/openai/gpt-oss-20b", {
      input:
        "以下の内容を、日本語で200文字程度の概要と2~5個の箇条書きで、markdown形式にまとめてください。出力形式は概要と箇条書きのみで、タイトルセクション等は含めないでください。\n\n" +
        markdown.data,
    });

    const completed = summaryResponse.output?.find(
      (o) => o.status === "completed",
    );
    if (completed?.status !== "completed") {
      return c.redirect("/");
    }
    const [summary] = (completed as ResponseOutputMessage).content;

    if (summary.type === "refusal") {
      return c.redirect("/");
    }

    const inserted = await insertMemoWithinQuota(c.env.MY_MEMO_D1, {
      id: crypto.randomUUID(),
      title: decodeHtmlEntities(title || "No Title"),
      content: summary.text,
      userId: user.id,
      aiGenerated: 1,
      url,
      categoryId: validated.category ?? null,
      tags: validated.tags,
    });
    if (!inserted) {
      return quotaError(
        c,
        "/memos/url-summary",
        "メモの上限に達したため、要約を保存できませんでした。",
      );
    }

    return c.redirect("/");
  });

export default memosRoute;
