import { zValidator } from "@hono/zod-validator";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { memosTable } from "../../../schema";
import { memoSchema } from "./memoSchema";

const memosRoute = new Hono<{ Bindings: CloudflareBindings }>();

memosRoute
  .post("/create", zValidator("form", memoSchema.create), async (c) => {
    const user = c.get("user");
    const db = drizzle(c.env.MY_MEMO_D1);

    const validated = c.req.valid("form");
    await db.insert(memosTable).values({
      ...validated,
      userEmail: user!.email,
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
        and(eq(memosTable.userEmail, user!.email), eq(memosTable.id, memoId)),
      )
      .get();

    if (memo) {
      await db
        .delete(memosTable)
        .where(
          and(eq(memosTable.userEmail, user!.email), eq(memosTable.id, memoId)),
        );
    }

    return c.redirect("/");
  });

export default memosRoute;
