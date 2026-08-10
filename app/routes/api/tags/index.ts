import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { getAppDb } from "@/features/access-control/authorization";
import { tagsTable } from "@/schema";

const tagsRoute = new Hono<{ Bindings: CloudflareBindings }>();

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
