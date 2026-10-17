import adapter from "waku/adapters/cloudflare";
import { fsRouter } from "waku/router/server";
import { app, scheduled } from "./server";

export default adapter(
  fsRouter(import.meta.glob(["./pages/**/*.{tsx,ts}", "!./pages/**/*.test.*"])),
  {
    middlewareFns: [
      ({ app: worker }) => {
        worker.route("/", app);
        return async (_c, next) => next();
      },
    ],
    handlers: { scheduled },
  },
);
