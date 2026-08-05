import { jsxRenderer } from "hono/jsx-renderer";
import { Link, Script } from "honox/server";
import { RootLayout } from "@/routes/-shared";

export default jsxRenderer(({ children }) => {
  return (
    <html lang="ja">
      <head>
        <meta charset="utf-8" />
        <meta content="width=device-width, initial-scale=1.0" name="viewport" />
        <meta content="#f7f3ed" name="theme-color" />
        <link href="/manifest.webmanifest" rel="manifest" />
        <link href="/favicon.svg" rel="icon" type="image/svg+xml" />
        <link href="/favicon.ico" rel="alternate icon" />
        <link href="/icons/apple-touch-icon.png" rel="apple-touch-icon" />
        <Link href="/app/style.css" rel="stylesheet" />
        <Script src="/app/client.ts" />
      </head>
      <body>
        <RootLayout>{children}</RootLayout>
      </body>
    </html>
  );
});
