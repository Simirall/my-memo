import { betterAuth } from "better-auth";

export const getAuth = (env: Cloudflare.Env) => {
  return betterAuth({
    trustedOrigins: ["http://localhost:5173"],
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    socialProviders: {
      github: {
        clientId: env.GITHUB_CLIENT_ID,
        clientSecret: env.GITHUB_CLIENT_SECRET,
      },
    },
  });
};
