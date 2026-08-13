import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import {
  finalizeAccountDeletions,
  getAccountDeletionStatus,
  getAccountDeletionStatusForUser,
  hashDeletionReceipt,
  replaceAccountDeletionReceipt,
  retryAccountDeletion,
  startAccountDeletion,
} from "@/features/account-deletion/server/account-deletion";
import { processR2DeletionJobs } from "@/features/attachments/server/r2-deletion-jobs";

const RECEIPT_COOKIE = "my-memo.account-deletion";
const accountDeletionRoute = new Hono<{ Bindings: CloudflareBindings }>();

const receiptHashFromCookie = async (cookie: string | undefined) =>
  cookie ? hashDeletionReceipt(cookie) : null;

const setReceiptCookie = (
  c: Parameters<typeof setCookie>[0],
  receipt: string,
) =>
  setCookie(c, RECEIPT_COOKIE, receipt, {
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
    sameSite: "Strict",
    secure: new URL(c.req.url).protocol === "https:",
  });

const continueDeletion = async (env: CloudflareBindings) => {
  await processR2DeletionJobs(env);
  await finalizeAccountDeletions(env);
};

accountDeletionRoute.post("/", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ message: "認証が必要です。" }, 401);

  const receipt = crypto.randomUUID();
  const result = await startAccountDeletion(
    c.env.MY_MEMO_D1,
    user.id,
    await hashDeletionReceipt(receipt),
  );
  if (!result.created) return c.json({ status: result.status }, 409);

  setReceiptCookie(c, receipt);
  c.executionCtx.waitUntil(continueDeletion(c.env));
  return c.json({ status: result.status }, 202);
});

accountDeletionRoute.get("/status", async (c) => {
  const receiptHash = await receiptHashFromCookie(getCookie(c, RECEIPT_COOKIE));
  const result = receiptHash
    ? await getAccountDeletionStatus(c.env.MY_MEMO_D1, receiptHash)
    : null;
  if (result && result.status !== "complete") return c.json(result);

  const user = c.get("user");
  const deletion = user
    ? await getAccountDeletionStatusForUser(c.env.MY_MEMO_D1, user.id)
    : null;
  if (user && deletion) {
    const replacement = crypto.randomUUID();
    await replaceAccountDeletionReceipt(
      c.env.MY_MEMO_D1,
      user.id,
      await hashDeletionReceipt(replacement),
    );
    setReceiptCookie(c, replacement);
    return c.json(deletion);
  }
  if (!result) return c.json({ message: "退会処理を確認できません。" }, 401);

  if (result.status === "complete") {
    deleteCookie(c, RECEIPT_COOKIE, { path: "/" });
    c.header("Clear-Site-Data", '"*"');
  }
  return c.json(result);
});

accountDeletionRoute.post("/retry", async (c) => {
  const receiptHash = await receiptHashFromCookie(getCookie(c, RECEIPT_COOKIE));
  if (!receiptHash)
    return c.json({ message: "退会処理を確認できません。" }, 401);
  if (!(await retryAccountDeletion(c.env.MY_MEMO_D1, receiptHash)))
    return c.json({ status: "complete" }, 410);

  c.executionCtx.waitUntil(continueDeletion(c.env));
  return c.json({ status: "processing" });
});

export default accountDeletionRoute;
