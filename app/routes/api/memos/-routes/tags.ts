import { zValidator } from "@hono/zod-validator";
import { and, asc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { getAppDb } from "@/features/access-control/authorization";
import { tagUpdateSchema } from "@/features/memos/schema/memo-schema";
import {
  getTagSuggestions,
  normalizeTagNames,
  replaceMemoTags,
} from "@/features/tags/data/tags";
import { memosTable, memoTagsTable, tagsTable } from "@/schema";

const tagsRoute = new Hono<{ Bindings: CloudflareBindings }>();

tagsRoute.post("/:id/tags", zValidator("json", tagUpdateSchema), async (c) => {
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
    .where(and(eq(memoTagsTable.memoId, memoId), eq(tagsTable.userId, user.id)))
    .orderBy(asc(tagsTable.name));

  return c.json({
    tags,
    tagSuggestions: await getTagSuggestions(db, user.id),
  });
});

export default tagsRoute;
