import { zValidator } from "@hono/zod-validator";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { memosTable } from "../../../schema";
import { decodeHtmlEntities } from "../../../utils/decodeHtmlEntities";
import { decodeHtmlWithCorrectEncoding } from "../../../utils/decodeHtmlWithCorrectEncoding";
import { memoSchema } from "./memoSchema";

const memosRoute = new Hono<{ Bindings: CloudflareBindings }>();

memosRoute
  .post("/create", zValidator("form", memoSchema.create), async (c) => {
    const user = c.get("user");
    const db = drizzle(c.env.MY_MEMO_D1);

    const validated = c.req.valid("form");
    await db.insert(memosTable).values({
      ...validated,
      userId: user!.id,
    });

    return c.redirect("/");
  })
  .post("/delete/:id", async (c) => {
    const user = c.get("user");
    const memoId = c.req.param("id");
    const db = drizzle(c.env.MY_MEMO_D1);

    const memo = await db
      .select()
      .from(memosTable)
      .where(
        and(eq(memosTable.userId, user!.id), eq(memosTable.id, memoId)),
      )
      .get();

    if (memo) {
      await db
        .delete(memosTable)
        .where(
          and(eq(memosTable.userId, user!.id), eq(memosTable.id, memoId)),
        );
    }

    return c.redirect("/");
  })
  .post("/url", zValidator("form", memoSchema.url), async (c) => {
    const user = c.get("user");
    const db = drizzle(c.env.MY_MEMO_D1);

    const validated = c.req.valid("form");
    const url = validated.url;

    const response = await fetch(url);

    // HTMLを正しいエンコーディングでデコード
    const htmlText = await decodeHtmlWithCorrectEncoding(response);

    // UTF-8のBlobとして再生成してAIに渡す
    const utf8Blob = new Blob([htmlText], { type: "text/html; charset=utf-8" });

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

    const [summary] = (
      summaryResponse.output?.find(
        (o) => o.status === "completed",
      ) as ResponseOutputMessage
    ).content;

    if (summary.type === "refusal") {
      return c.redirect("/");
    }

    await db.insert(memosTable).values({
      title: decodeHtmlEntities(title || "No Title"),
      content: summary.text,
      userId: user!.id,
      aiGenerated: 1,
      url: url,
      categoryId: validated.category,
    });

    return c.redirect("/");
  });

export default memosRoute;
