import { jsxRenderer } from "hono/jsx-renderer";
import { Link, Script } from "honox/server";
import { RootLayout } from "@/components/root-layout";

export const JAVASCRIPT_REQUIRED_MESSAGE =
  "このアプリの利用には JavaScript が必要です。ブラウザーの設定で JavaScript を有効にして、ページを再読み込みしてください。";

export const JavaScriptRequiredStyle = () => (
  <noscript>
    <style>{"#app-with-javascript { display: none !important; }"}</style>
  </noscript>
);

export const JavaScriptRequiredFallback = () => (
  <noscript>
    <main className="flex min-h-screen items-center justify-center bg-base-100 p-4 text-base-content">
      <div className="alert alert-warning w-fit" role="alert">
        {JAVASCRIPT_REQUIRED_MESSAGE}
      </div>
    </main>
  </noscript>
);

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
        <JavaScriptRequiredStyle />
      </head>
      <body>
        <JavaScriptRequiredFallback />
        <div id="app-with-javascript">
          <RootLayout>{children}</RootLayout>
        </div>
      </body>
    </html>
  );
});
