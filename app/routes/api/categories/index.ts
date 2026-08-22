import { zValidator } from "@hono/zod-validator";
import { and, eq, max, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { categorySchema } from "@/features/categories/schema/category-schema";
import { categoriesTable } from "@/schema";

const categoriesRoute = new Hono<{ Bindings: CloudflareBindings }>();

const isCategoryNameUniqueConstraintError = (error: unknown) => {
  const cause =
    error instanceof Error && "cause" in error ? error.cause : undefined;
  const message = [
    error instanceof Error ? error.message : "",
    cause instanceof Error ? cause.message : "",
  ].join("\n");

  return /unique constraint failed: categories\.user_id, categories\.name/i.test(
    message,
  );
};

categoriesRoute
  .post("/create", zValidator("form", categorySchema.create), async (c) => {
    const user = c.get("user");
    if (!user) return c.redirect("/login");
    const db = drizzle(c.env.MY_MEMO_D1);

    const validated = c.req.valid("form");
    const currentLast = await db
      .select({ sortOrder: max(categoriesTable.sortOrder) })
      .from(categoriesTable)
      .where(eq(categoriesTable.userId, user.id))
      .get();
    try {
      await db.insert(categoriesTable).values({
        ...validated,
        userId: user.id,
        sortOrder: (currentLast?.sortOrder ?? -1) + 1,
      });
    } catch (error) {
      if (isCategoryNameUniqueConstraintError(error)) {
        return c.redirect("/settings/categories?error=duplicate");
      }
      throw error;
    }

    return c.redirect("/settings/categories?created=1");
  })
  .post("/rename/:id", async (c) => {
    const user = c.get("user");
    if (!user) return c.json({ message: "認証が必要です。" }, 401);

    const body = await c.req.json().catch(() => null);
    const parsed = categorySchema.rename.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { message: parsed.error.issues[0]?.message ?? "入力が不正です。" },
        400,
      );
    }

    const db = drizzle(c.env.MY_MEMO_D1);
    const id = c.req.param("id");
    const category = await db
      .select({
        name: categoriesTable.name,
        excludeFromAll: categoriesTable.excludeFromAll,
      })
      .from(categoriesTable)
      .where(
        and(eq(categoriesTable.id, id), eq(categoriesTable.userId, user.id)),
      )
      .get();

    if (!category) {
      return c.json({ message: "カテゴリーが見つかりません。" }, 404);
    }
    if (
      category.name === parsed.data.name &&
      category.excludeFromAll === parsed.data.excludeFromAll
    ) {
      return c.json({ ok: true, ...category });
    }

    try {
      await db
        .update(categoriesTable)
        .set({
          name: parsed.data.name,
          excludeFromAll: parsed.data.excludeFromAll,
          updatedAt: sql`CURRENT_TIMESTAMP`,
        })
        .where(
          and(eq(categoriesTable.id, id), eq(categoriesTable.userId, user.id)),
        );
    } catch (error) {
      if (isCategoryNameUniqueConstraintError(error)) {
        return c.json(
          { message: "同じ名前のカテゴリーがすでに登録されています。" },
          409,
        );
      }
      throw error;
    }

    return c.json({ ok: true, ...parsed.data });
  })
  .post("/reorder", async (c) => {
    const user = c.get("user");
    if (!user) return c.json({ message: "認証が必要です。" }, 401);

    const body = await c.req.json().catch(() => null);
    const parsed = categorySchema.reorder.safeParse(body);
    if (!parsed.success) {
      return c.json({ message: "並び順が不正です。" }, 400);
    }

    const categoryIds = parsed.data.categoryIds;
    const uniqueIds = new Set(categoryIds);
    const owned = await c.env.MY_MEMO_D1.prepare(
      "SELECT id FROM categories WHERE user_id = ?",
    )
      .bind(user.id)
      .all<{ id: string }>();
    const ownedIds = new Set(owned.results.map((category) => category.id));

    if (
      uniqueIds.size !== categoryIds.length ||
      ownedIds.size !== categoryIds.length ||
      categoryIds.some((id) => !ownedIds.has(id))
    ) {
      return c.json({ message: "並び順が不正です。" }, 400);
    }

    if (categoryIds.length > 0) {
      await c.env.MY_MEMO_D1.batch(
        categoryIds.map((id, sortOrder) =>
          c.env.MY_MEMO_D1.prepare(
            "UPDATE categories SET sort_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?",
          ).bind(sortOrder, id, user.id),
        ),
      );
    }

    return c.json({ ok: true });
  })
  .post("/delete/:id", async (c) => {
    const user = c.get("user");
    if (!user) return c.redirect("/login");
    const memoId = c.req.param("id");
    const db = drizzle(c.env.MY_MEMO_D1);

    const memo = await db
      .select()
      .from(categoriesTable)
      .where(
        and(
          eq(categoriesTable.userId, user.id),
          eq(categoriesTable.id, memoId),
        ),
      )
      .get();

    if (memo) {
      await db
        .delete(categoriesTable)
        .where(
          and(
            eq(categoriesTable.userId, user.id),
            eq(categoriesTable.id, memoId),
          ),
        );
    }

    return c.redirect("/settings/categories");
  });

export default categoriesRoute;
