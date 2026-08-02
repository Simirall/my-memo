import { jsxRenderer } from "hono/jsx-renderer";
import { Link, Script } from "honox/server";
import { RootLayout } from "../components/root-layout";

export default jsxRenderer(({ children }) => {
  return (
    <html lang="ja">
      <head>
        <meta charset="utf-8" />
        <meta content="width=device-width, initial-scale=1.0" name="viewport" />
        <link href="/favicon.ico" rel="icon" />
        <Link href="/app/style.css" rel="stylesheet" />
        <Script src="/app/client.ts" />
      </head>
      <body>
        <RootLayout>{children}</RootLayout>
      </body>
    </html>
  );
});
