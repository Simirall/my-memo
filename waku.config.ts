import path from "node:path";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "waku/config";

export default defineConfig({
  srcDir: "app",
  unstable_adapter: "waku/adapters/cloudflare",
  vite: {
    resolve: { alias: { "@": path.resolve(import.meta.dirname, "app") } },
    environments: {
      rsc: {
        optimizeDeps: { include: ["hono/tiny"] },
        build: { rolldownOptions: { platform: "neutral" } },
      },
      ssr: {
        optimizeDeps: { include: ["waku > rsc-html-stream/server"] },
        build: { rolldownOptions: { platform: "neutral" } },
      },
    },
    plugins: [
      tailwindcss(),
      cloudflare({
        // ビルド時の静的生成はローカルで完結させ、開発時は Workers AI に接続する。
        remoteBindings:
          !process.env.CI && process.env.NODE_ENV === "development",
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        inspectorPort: false,
      }),
    ],
  },
});
