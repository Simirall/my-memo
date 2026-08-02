import { applyD1Migrations, type D1Migration } from "cloudflare:test";
import { env } from "cloudflare:workers";

const testEnv = env as Cloudflare.Env & { TEST_MIGRATIONS: D1Migration[] };

await applyD1Migrations(testEnv.MY_MEMO_D1, testEnv.TEST_MIGRATIONS);
