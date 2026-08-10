import { zValidator } from "@hono/zod-validator";
import { and, eq } from "drizzle-orm";
import { type Context, Hono } from "hono";
import { getAppDb } from "@/features/access-control/authorization";
import { parseAttachmentRange } from "@/features/attachments/server/attachments";
import { memoSchema } from "@/features/memos/schema/memo-schema";
import {
  finalizeShareIntake,
  getShareIntake,
  removeShareIntake,
  removeShareIntakeFile,
  ShareIntakeError,
} from "@/features/sharing/intake/share-intake";
import { categoriesTable } from "@/schema";

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

shareIntakesRoute.get("/:id/files/:fileId", async (c: ShareIntakesContext) => {
  const user = c.get("user");
  if (!user) return c.json({ message: "認証が必要です。" }, 401);
  const intake = await getShareIntake(c.env, user.id, c.req.param("id") ?? "");
  const file = intake?.files.find(
    (candidate) => candidate.id === c.req.param("fileId"),
  );
  if (!file || intake?.status !== "pending") {
    return c.json({ message: "共有ファイルが見つかりません。" }, 404);
  }
  const rangeHeader = c.req.header("Range");
  const range = rangeHeader
    ? parseAttachmentRange(rangeHeader, file.sizeBytes)
    : undefined;
  if (rangeHeader && !range) {
    return new Response(null, {
      status: 416,
      headers: {
        "Accept-Ranges": "bytes",
        "Content-Range": `bytes */${file.sizeBytes}`,
      },
    });
  }
  const object = await c.env.MY_MEMO_FILES.get(
    file.r2Key,
    range ? { range } : undefined,
  );
  if (!object || !("body" in object)) {
    return c.json({ message: "共有ファイルを取得できませんでした。" }, 404);
  }
  const headers = new Headers({
    "Content-Type": file.contentType,
    "Content-Disposition": "inline",
    "X-Content-Type-Options": "nosniff",
    ETag: object.httpEtag,
    "Accept-Ranges": "bytes",
  });
  if (object.uploaded)
    headers.set("Last-Modified", object.uploaded.toUTCString());
  if (range && object.range) {
    const objectRange = object.range;
    const offset =
      "suffix" in objectRange
        ? Math.max(object.size - objectRange.suffix, 0)
        : (objectRange.offset ?? 0);
    const length =
      "suffix" in objectRange
        ? object.size - offset
        : (objectRange.length ?? object.size - offset);
    headers.set(
      "Content-Range",
      `bytes ${offset}-${offset + length - 1}/${object.size}`,
    );
    headers.set("Content-Length", String(length));
    return new Response(object.body, { status: 206, headers });
  }
  headers.set("Content-Length", String(object.size));
  return new Response(object.body, { headers });
});

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
      const form = await c.req.formData();
      const thumbnailFileIdsValue = form.get("thumbnailFileIds");
      let thumbnailFileIds: string[] = [];
      try {
        const parsed = JSON.parse(
          typeof thumbnailFileIdsValue === "string"
            ? thumbnailFileIdsValue
            : "[]",
        );
        if (
          !Array.isArray(parsed) ||
          parsed.some((id) => typeof id !== "string")
        ) {
          throw new Error();
        }
        thumbnailFileIds = parsed;
      } catch {
        throw new ShareIntakeError("共有画像のサムネイル情報が不正です。", 400);
      }
      const thumbnailFiles = form
        .getAll("thumbnails")
        .filter((value): value is File => value instanceof File);
      if (thumbnailFiles.length !== thumbnailFileIds.length) {
        throw new ShareIntakeError(
          "共有画像のサムネイルが不足しています。",
          400,
        );
      }
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
          mediaDimensions: validated.mediaDimensions,
          thumbnails: thumbnailFiles.map((file, index) => ({
            fileId: thumbnailFileIds[index] ?? "",
            file,
          })),
        },
      );
      return c.json(result);
    } catch (error) {
      return errorResponse(c, error);
    }
  },
);

export default shareIntakesRoute;
