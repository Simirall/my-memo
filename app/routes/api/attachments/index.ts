import { and, eq } from "drizzle-orm";
import { type Context, Hono } from "hono";
import { memoAttachmentsTable } from "@/schema";
import {
  attachmentContentDisposition,
  getAttachmentPreviewKind,
  getAttachmentQuota,
  parseAttachmentRange,
} from "@/utils/attachments";
import { getAppDb } from "@/utils/authorization";

const attachmentsRoute = new Hono<{ Bindings: CloudflareBindings }>();
type AttachmentsContext = Context<{ Bindings: CloudflareBindings }>;

attachmentsRoute.get("/quota", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ message: "認証が必要です。" }, 401);

  const quota = await getAttachmentQuota(getAppDb(c.env), user.id);
  if (!quota) {
    return c.json(
      {
        code: "PLAN_CONFIGURATION_ERROR",
        message: "添付容量の上限設定がありません。",
      },
      500,
    );
  }
  return c.json(quota);
});

attachmentsRoute.get("/:id", async (c: AttachmentsContext) => {
  const user = c.get("user");
  if (!user) return c.json({ message: "認証が必要です。" }, 401);

  const attachmentId = c.req.param("id") ?? "";
  const attachment = await getAppDb(c.env)
    .select()
    .from(memoAttachmentsTable)
    .where(
      and(
        eq(memoAttachmentsTable.id, attachmentId),
        eq(memoAttachmentsTable.userId, user.id),
      ),
    )
    .get();
  if (!attachment)
    return c.json({ message: "添付ファイルが見つかりません。" }, 404);

  const rangeHeader = c.req.header("Range");
  const range = rangeHeader
    ? parseAttachmentRange(rangeHeader, attachment.sizeBytes)
    : undefined;
  if (rangeHeader && !range) {
    return new Response(null, {
      status: 416,
      headers: {
        "Accept-Ranges": "bytes",
        "Content-Range": `bytes */${attachment.sizeBytes}`,
      },
    });
  }

  // getPlatformProxy used by the local Vite adapter cannot serialize Headers.
  // A plain R2Range also keeps local development behavior aligned with workerd.
  const object = await c.env.MY_MEMO_FILES.get(
    attachment.r2Key,
    range ? { range } : undefined,
  );
  if (!object || !("body" in object)) {
    return c.json({ message: "添付ファイルを取得できませんでした。" }, 404);
  }
  const body = object.body;

  const preview = c.req.query("preview") === "1";
  const inline =
    preview && getAttachmentPreviewKind(attachment.contentType) !== null;
  const headers = new Headers({
    "Content-Type": attachment.contentType,
    "Content-Disposition": attachmentContentDisposition(
      attachment.fileName,
      inline,
    ),
    "X-Content-Type-Options": "nosniff",
    ETag: object.httpEtag,
    "Accept-Ranges": "bytes",
  });
  if (object.uploaded)
    headers.set("Last-Modified", object.uploaded.toUTCString());
  if (object.range) {
    const range = object.range;
    const offset =
      "suffix" in range
        ? Math.max(object.size - range.suffix, 0)
        : (range.offset ?? 0);
    const length =
      "suffix" in range
        ? object.size - offset
        : (range.length ?? object.size - offset);
    headers.set(
      "Content-Range",
      `bytes ${offset}-${offset + length - 1}/${object.size}`,
    );
    headers.set("Content-Length", String(length));
    return new Response(body, { status: 206, headers });
  }
  headers.set("Content-Length", String(object.size));
  return new Response(body, { headers });
});

attachmentsRoute.delete("/:id", async (c: AttachmentsContext) => {
  const user = c.get("user");
  if (!user) return c.json({ message: "認証が必要です。" }, 401);

  const db = getAppDb(c.env);
  const attachmentId = c.req.param("id") ?? "";
  const attachment = await db
    .select()
    .from(memoAttachmentsTable)
    .where(
      and(
        eq(memoAttachmentsTable.id, attachmentId),
        eq(memoAttachmentsTable.userId, user.id),
      ),
    )
    .get();
  if (!attachment)
    return c.json({ message: "添付ファイルが見つかりません。" }, 404);

  try {
    await c.env.MY_MEMO_FILES.delete(attachment.r2Key);
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "memo_attachment_delete_failed",
        attachmentId: attachment.id,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    return c.json({ message: "添付ファイルを削除できませんでした。" }, 502);
  }

  await db
    .delete(memoAttachmentsTable)
    .where(
      and(
        eq(memoAttachmentsTable.id, attachment.id),
        eq(memoAttachmentsTable.userId, user.id),
      ),
    );
  return c.json({ ok: true });
});

export default attachmentsRoute;
