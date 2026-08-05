import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import type { Context } from "hono";
import { Hono } from "hono";
import { z } from "zod";
import { plansTable } from "@/schema";
import { getAppDb, getFreshUser } from "@/utils/authorization";

const userChangeSchema = z.object({
  role: z.enum(["user", "admin"]),
  planId: z.string().min(1),
});

const usersRoute = new Hono<{ Bindings: CloudflareBindings }>();
type AdminUsersContext = Context<{ Bindings: CloudflareBindings }>;

const successResponse = (c: AdminUsersContext) => {
  if (c.req.header("Accept")?.includes("application/json")) {
    return c.json({ ok: true });
  }
  return c.redirect("/admin/users", 303);
};

usersRoute.post("/:id", zValidator("form", userChangeSchema), async (c) => {
  const actor = c.get("user");
  if (!actor) return c.json({ code: "UNAUTHORIZED" }, 401);

  const db = getAppDb(c.env);
  const freshActor = await getFreshUser(db, actor.id);
  if (freshActor?.role !== "admin") {
    return c.json({ code: "FORBIDDEN" }, 403);
  }

  const targetId = c.req.param("id");
  const target = await getFreshUser(db, targetId);
  if (!target) return c.json({ code: "NOT_FOUND" }, 404);

  const validated = c.req.valid("form");
  const plan = await db
    .select({ id: plansTable.id, isActive: plansTable.isActive })
    .from(plansTable)
    .where(eq(plansTable.id, validated.planId))
    .get();
  if (!plan || (!plan.isActive && validated.planId !== target.planId)) {
    return c.json(
      { code: "INVALID_PLAN", message: "有効なプランを選択してください。" },
      400,
    );
  }

  const roleChanged = target.role !== validated.role;
  const planChanged = target.planId !== validated.planId;
  if (!roleChanged && !planChanged) {
    return successResponse(c);
  }

  const now = Date.now();
  const update = c.env.MY_MEMO_D1.prepare(
    `UPDATE user
         SET role = ?, plan_id = ?, updated_at = ?
         WHERE id = ? AND role = ? AND plan_id = ?`,
  ).bind(
    validated.role,
    validated.planId,
    now,
    targetId,
    target.role,
    target.planId,
  );
  const audit = c.env.MY_MEMO_D1.prepare(
    `INSERT INTO authorization_audit_logs
          (id, actor_user_id, target_user_id, action, previous_value, current_value)
         SELECT ?, ?, ?, 'user_access_changed', ?, ?
         WHERE changes() = 1`,
  ).bind(
    crypto.randomUUID(),
    freshActor.id,
    targetId,
    JSON.stringify({ role: target.role, planId: target.planId }),
    JSON.stringify({ role: validated.role, planId: validated.planId }),
  );

  try {
    const [updateResult] = await c.env.MY_MEMO_D1.batch([update, audit]);
    if (updateResult.meta.changes !== 1) {
      return c.json(
        {
          code: "CONFLICT",
          message: "対象ユーザーの状態が変わりました。再読み込みしてください。",
        },
        409,
      );
    }
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("last administrator")
    ) {
      return c.json(
        {
          code: "LAST_ADMIN",
          message: "最後の管理者の権限は外せません。",
        },
        409,
      );
    }
    throw error;
  }

  return successResponse(c);
});

export default usersRoute;
