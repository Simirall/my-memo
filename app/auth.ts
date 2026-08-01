import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export const getAuth = (env: Cloudflare.Env) => {
  const db = drizzle(env.MY_MEMO_D1, { schema });
  return betterAuth({
    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema: {
        user: schema.userTable,
        session: schema.sessionTable,
        account: schema.accountTable,
        verification: schema.verificationTable,
      },
    }),
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
        refreshCache: true,
      },
    },
  });
};
