import { zValidator } from "@hono/zod-validator";
import { and, eq } from "drizzle-orm";
import { type Context, Hono } from "hono";
import { memoSchema } from "@/routes/-features/memos";
import {
  finalizeShareIntake,
  removeShareIntake,
  removeShareIntakeFile,
  ShareIntakeError,
} from "@/routes/-features/sharing/share-intake";
import { categoriesTable } from "@/schema";
import { getAppDb } from "@/utils/authorization";

const shareIntakesRoute = new Hono<{ Bindings: CloudflareBindings }>();
type ShareIntakesContext = Context<{ Bindings: CloudflareBindings }>;
type ShareIntakeStatus = 400 | 404 | 409 | 413 | 500 | 502;

const errorResponse = (c: ShareIntakesContext, error: unknown) => {
  if (error instanceof ShareIntakeError) {
    const status: ShareIntakeStatus = [400, 404, 409, 413, 500, 502].includes(
      error.status,
    )
      ? (error.status as ShareIntakeStatus)
      : 500;
    return c.json({ message: error.message }, status);
  }
  console.error(
    JSON.stringify({
      event: "share_intake_api_failed",
      error: error instanceof Error ? error.message : String(error),
    }),
  );
  return c.json({ message: "共有内容を処理できませんでした。" }, 500);
};

shareIntakesRoute.delete(
  "/:id/files/:fileId",
  async (c: ShareIntakesContext) => {
    const user = c.get("user");
    if (!user) return c.json({ message: "認証が必要です。" }, 401);
    try {
      const intake = await removeShareIntakeFile(
        c.env,
        user.id,
        c.req.param("id") ?? "",
        c.req.param("fileId") ?? "",
      );
      if (!intake)
        return c.json({ message: "共有ファイルが見つかりません。" }, 404);
      return c.json(intake);
    } catch (error) {
      return errorResponse(c, error);
    }
  },
);

shareIntakesRoute.delete("/:id", async (c: ShareIntakesContext) => {
  const user = c.get("user");
  if (!user) return c.json({ message: "認証が必要です。" }, 401);
  try {
    const removed = await removeShareIntake(
      c.env,
      user.id,
      c.req.param("id") ?? "",
    );
    if (!removed) return c.json({ message: "共有内容が見つかりません。" }, 404);
    return c.json({ ok: true });
  } catch (error) {
    return errorResponse(c, error);
  }
});

shareIntakesRoute.post(
  "/:id/finalize",
  zValidator("form", memoSchema.create),
  async (c) => {
    const user = c.get("user");
    if (!user) return c.json({ message: "認証が必要です。" }, 401);

    try {
      const validated = c.req.valid("form");
      const categoryId = validated.categoryId ?? null;
      if (categoryId) {
        const category = await getAppDb(c.env)
          .select({ id: categoriesTable.id })
          .from(categoriesTable)
          .where(
            and(
              eq(categoriesTable.id, categoryId),
              eq(categoriesTable.userId, user.id),
            ),
          )
          .get();
        if (!category)
          throw new ShareIntakeError("カテゴリが見つかりません。", 400);
      }

      const result = await finalizeShareIntake(
        c.env,
        user.id,
        c.req.param("id") ?? "",
        {
          title: validated.title,
          content: validated.content,
          url: validated.url ?? null,
          categoryId,
          tags: validated.tags,
        },
      );
      return c.json(result);
    } catch (error) {
      return errorResponse(c, error);
    }
  },
);

export default shareIntakesRoute;
