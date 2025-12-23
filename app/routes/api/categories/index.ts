import { zValidator } from "@hono/zod-validator";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { categoriesTable } from "../../../schema";
import { categorySchema } from "./categoriesSchema";
import { and, eq } from "drizzle-orm";

const categoriesRoute = new Hono<{ Bindings: CloudflareBindings }>();

categoriesRoute.post(
  "/create",
  zValidator("form", categorySchema.create),
  async (c) => {
    const user = c.get("user");
    const db = drizzle(c.env.MY_MEMO_D1);

    const validated = c.req.valid("form");
    await db.insert(categoriesTable).values({
      ...validated,
      userEmail: user!.email,
    });

    return c.redirect("/categories");
  },
).post("/delete/:id", async (c) => {
    const user = c.get("user");
    const memoId = c.req.param("id");
    const db = drizzle(c.env.MY_MEMO_D1);

    const memo = await db
      .select()
      .from(categoriesTable)
      .where(
        and(
          eq(categoriesTable.userEmail, user!.email),
          eq(categoriesTable.id, memoId),
        ),
      )
      .get();

    if (memo) {
      await db
        .delete(categoriesTable)
        .where(
          and(
            eq(categoriesTable.userEmail, user!.email),
            eq(categoriesTable.id, memoId),
          ),
        );
    }

    return c.redirect("/");
  });;

export default categoriesRoute;
