import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { admin } from "better-auth/plugins";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import {
  accountTable,
  planLimitsTable,
  plansTable,
  sessionTable,
  userTable,
  verificationTable,
} from "./schema";

const requiredPlanMetrics = ["memo.total", "ai_summary.monthly"] as const;

const disabledAdminPaths = [
  "/admin/ban-user",
  "/admin/create-user",
  "/admin/get-user",
  "/admin/has-permission",
  "/admin/impersonate-user",
  "/admin/list-user-sessions",
  "/admin/list-users",
  "/admin/remove-user",
  "/admin/revoke-user-session",
  "/admin/revoke-user-sessions",
  "/admin/set-role",
  "/admin/set-user-password",
  "/admin/stop-impersonating",
  "/admin/unban-user",
  "/admin/update-user",
];

export const getAuth = (env: Cloudflare.Env) => {
  const db = drizzle(env.MY_MEMO_D1);
  return betterAuth({
    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema: {
        user: userTable,
        session: sessionTable,
        account: accountTable,
        verification: verificationTable,
      },
    }),
    disabledPaths: disabledAdminPaths,
    plugins: [admin()],
    user: {
      additionalFields: {
        planId: {
          type: "string",
          // The database hook supplies this server-owned value. Marking the
          // field required here makes Better Auth validate it before the hook
          // can populate it during OAuth user creation.
          required: false,
          input: false,
        },
      },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            const defaultPlan = await db
              .select({ id: plansTable.id })
              .from(plansTable)
              .where(
                and(
                  eq(plansTable.isDefault, true),
                  eq(plansTable.isActive, true),
                ),
              )
              .get();

            if (!defaultPlan) {
              throw new APIError("INTERNAL_SERVER_ERROR", {
                message: "The default plan is not configured.",
              });
            }

            const configuredMetrics = await db
              .select({ metric: planLimitsTable.metric })
              .from(planLimitsTable)
              .where(eq(planLimitsTable.planId, defaultPlan.id))
              .all();
            const configuredMetricNames = new Set(
              configuredMetrics.map(({ metric }) => metric),
            );

            if (
              requiredPlanMetrics.some(
                (metric) => !configuredMetricNames.has(metric),
              )
            ) {
              throw new APIError("INTERNAL_SERVER_ERROR", {
                message: "The default plan limits are not configured.",
              });
            }

            return { data: { ...user, planId: defaultPlan.id } };
          },
        },
      },
    },
    trustedOrigins: ["http://localhost:5173"],
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    socialProviders: {
      github: {
        clientId: env.GITHUB_CLIENT_ID,
        clientSecret: env.GITHUB_CLIENT_SECRET,
      },
    },
    session: {
      cookieCache: {
        maxAge: 60 * 60 * 24 * 7, // 7 days
      },
    },
  });
};
