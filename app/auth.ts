import { betterAuth } from "better-auth";

export const getAuth = (env: Cloudflare.Env) => {
  return betterAuth({
    baseURL: env.BETTER_AUTH_URL,
    socialProviders: {
      github: {
        clientId: env.GITHUB_CLIENT_ID,
        clientSecret: env.GITHUB_CLIENT_SECRET,
      },
    },
  });
};
