import { and, eq } from "drizzle-orm";
import { type Context, Hono } from "hono";
import { getAppDb } from "@/features/access-control/authorization";
import {
  attachmentContentDisposition,
  getAttachmentPreviewKind,
} from "@/features/attachments/model/attachment-constants";
import {
  getAttachmentQuota,
  parseAttachmentRange,
} from "@/features/attachments/server/attachments";
import {
  enqueueAttachmentDeletion,
  processR2DeletionJobs,
} from "@/features/attachments/server/r2-deletion-jobs";
import { scheduleBackgroundTask } from "@/features/link-preview/server/background-task";
import { memoAttachmentsTable } from "@/schema";

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

  const variant = c.req.query("variant");
  if (variant && variant !== "thumbnail") {
    return c.json({ message: "画像の種類が不正です。" }, 400);
  }
  if (variant === "thumbnail" && !attachment.thumbnailR2Key) {
    return c.json({ message: "サムネイルが見つかりません。" }, 404);
  }
  const isThumbnail = variant === "thumbnail";
  const objectKey = isThumbnail
    ? (attachment.thumbnailR2Key ?? attachment.r2Key)
    : attachment.r2Key;
  const objectSize = isThumbnail
    ? (attachment.thumbnailSizeBytes ?? attachment.sizeBytes)
    : attachment.sizeBytes;
  const contentType = isThumbnail
    ? (attachment.thumbnailContentType ?? attachment.contentType)
    : attachment.contentType;
  const rangeHeader = c.req.header("Range");
  const range = rangeHeader
    ? parseAttachmentRange(rangeHeader, objectSize)
    : undefined;
  if (rangeHeader && !range) {
    return new Response(null, {
      status: 416,
      headers: {
        "Accept-Ranges": "bytes",
        "Content-Range": `bytes */${objectSize}`,
        "Cache-Control": "private, no-store",
        "Cross-Origin-Resource-Policy": "same-origin",
      },
    });
  }

  // getPlatformProxy used by the local Vite adapter cannot serialize Headers.
  // A plain R2Range also keeps local development behavior aligned with workerd.
  const object = await c.env.MY_MEMO_FILES.get(
    objectKey,
    range ? { range } : undefined,
  );
  if (!object || !("body" in object)) {
    return c.json({ message: "添付ファイルを取得できませんでした。" }, 404);
  }
  const cacheHeaders = new Headers({
    ETag: object.httpEtag,
    "Cache-Control": "private, no-store",
    "Cross-Origin-Resource-Policy": "same-origin",
  });
  if (object.uploaded) {
    cacheHeaders.set("Last-Modified", object.uploaded.toUTCString());
  }
  const ifNoneMatch = c.req.header("If-None-Match");
  const ifModifiedSince = c.req.header("If-Modified-Since");
  const notModifiedByEtag =
    !rangeHeader &&
    ifNoneMatch
      ?.split(",")
      .map((value) => value.trim())
      .includes(object.httpEtag);
  const modifiedSince = ifModifiedSince ? Date.parse(ifModifiedSince) : NaN;
  const notModifiedByDate =
    !rangeHeader &&
    !ifNoneMatch &&
    object.uploaded &&
    Number.isFinite(modifiedSince) &&
    object.uploaded.getTime() <= modifiedSince + 999;
  if (notModifiedByEtag || notModifiedByDate) {
    return new Response(null, { status: 304, headers: cacheHeaders });
  }
  const body = object.body;

  const preview = c.req.query("preview") === "1" || isThumbnail;
  const inline = preview && getAttachmentPreviewKind(contentType) !== null;
  const headers = new Headers({
    "Content-Type": contentType,
    "Content-Disposition": attachmentContentDisposition(
      attachment.fileName,
      inline,
    ),
    "X-Content-Type-Options": "nosniff",
    ETag: object.httpEtag,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, no-store",
    "Cross-Origin-Resource-Policy": "same-origin",
  });
  if (object.uploaded)
    headers.set("Last-Modified", object.uploaded.toUTCString());
  if (range && object.range) {
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

  const deleted = await enqueueAttachmentDeletion(
    c.env.MY_MEMO_D1,
    attachment.id,
    user.id,
  );
  if (!deleted)
    return c.json({ message: "添付ファイルが見つかりません。" }, 404);

  const createDeletionTask = () => processR2DeletionJobs(c.env);
  const scheduled = scheduleBackgroundTask(
    () => c.executionCtx,
    createDeletionTask,
  );
  if (!scheduled) await createDeletionTask();
  return c.json({ ok: true });
});

export default attachmentsRoute;
