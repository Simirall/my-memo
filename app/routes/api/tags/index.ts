import { and, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { getAppDb } from "@/features/access-control/authorization";
import { normalizeTagNames } from "@/features/tags/data/tags";
import { tagsTable } from "@/schema";

const tagsRoute = new Hono<{ Bindings: CloudflareBindings }>();

const isTagNameUniqueConstraintError = (error: unknown) => {
  const cause =
    error instanceof Error && "cause" in error ? error.cause : undefined;
  const message = [
    error instanceof Error ? error.message : "",
    cause instanceof Error ? cause.message : "",
  ].join("\n");

  return /unique constraint failed: tags\.user_id, tags\.name/i.test(message);
};

tagsRoute.post("/rename/:id", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ message: "認証が必要です。" }, 401);

  const body: unknown = await c.req.json().catch(() => null);
  if (
    !body ||
    typeof body !== "object" ||
    !("name" in body) ||
    typeof body.name !== "string"
  ) {
    return c.json({ message: "入力が不正です。" }, 400);
  }

  const normalized = normalizeTagNames([body.name]);
  if (!normalized.ok) {
    return c.json({ message: normalized.message }, 400);
  }

  const db = getAppDb(c.env);
  const id = c.req.param("id");
  const tag = await db
    .select({ name: tagsTable.name })
    .from(tagsTable)
    .where(and(eq(tagsTable.id, id), eq(tagsTable.userId, user.id)))
    .get();

  if (!tag) return c.json({ message: "タグが見つかりません。" }, 404);

  const [name] = normalized.names;
  if (tag.name === name) return c.json({ ok: true, name });

  try {
    await db
      .update(tagsTable)
      .set({ name, updatedAt: sql`CURRENT_TIMESTAMP` })
      .where(and(eq(tagsTable.id, id), eq(tagsTable.userId, user.id)));
  } catch (error) {
    if (isTagNameUniqueConstraintError(error)) {
      return c.json(
        { message: "同じ名前のタグがすでに登録されています。" },
        409,
      );
    }
    throw error;
  }

  return c.json({ ok: true, name });
});

tagsRoute.post("/delete/:id", async (c) => {
  const user = c.get("user");
  if (!user) return c.redirect("/login");

  const tagId = c.req.param("id");
  const db = getAppDb(c.env);

  await db
    .delete(tagsTable)
    .where(and(eq(tagsTable.userId, user.id), eq(tagsTable.id, tagId)));

  return c.redirect("/settings/tags");
});

export default tagsRoute;
