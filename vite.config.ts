import path from "node:path";
import build from "@hono/vite-build/cloudflare-workers";
import adapter from "@hono/vite-dev-server/cloudflare";
import tailwindcss from "@tailwindcss/vite";
import honox from "honox/vite";
import { defineConfig } from "vite";

export default defineConfig({
  define: {
    "import.meta.vitest": "undefined",
  },
  resolve: {
    alias: {
      "@": path.resolve(process.cwd(), "app"),
    },
  },
  plugins: [
    honox({
      devServer: { adapter },
      client: {
        input: ["/app/style.css", "/app/client.ts"],
      },
    }),
    tailwindcss(),
    build(),
  ],
});
