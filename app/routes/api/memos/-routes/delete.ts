import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { getAppDb } from "@/features/access-control/authorization";
import {
  enqueueMemoDeletion,
  processR2DeletionJobs,
} from "@/features/attachments/server/r2-deletion-jobs";
import { scheduleBackgroundTask } from "@/features/link-preview/server/background-task";
import { getSafeMemoListReturnTo } from "@/features/memos/list/query/memo-list-query";
import { getUserTags } from "@/features/tags/data/tags";
import { memosTable } from "@/schema";

const deleteRoute = new Hono<{ Bindings: CloudflareBindings }>();

deleteRoute.post("/delete/:id", async (c) => {
  const user = c.get("user");
  if (!user) return c.redirect("/login");
  const memoId = c.req.param("id");
  const db = getAppDb(c.env);
  const tags = await getUserTags(db, user.id);
  const returnTo = getSafeMemoListReturnTo(
    c.req.query("returnTo"),
    new Set(tags.map((tag) => tag.id)),
  );

  const memo = await db
    .select()
    .from(memosTable)
    .where(and(eq(memosTable.userId, user.id), eq(memosTable.id, memoId)))
    .get();

  if (memo) {
    const deleted = await enqueueMemoDeletion(
      c.env.MY_MEMO_D1,
      memoId,
      user.id,
    );
    if (deleted) {
      const createDeletionTask = () => processR2DeletionJobs(c.env);
      const scheduled = scheduleBackgroundTask(
        () => c.executionCtx,
        createDeletionTask,
      );
      if (!scheduled) await createDeletionTask();
    }
  }

  return c.redirect(returnTo);
});

export default deleteRoute;
