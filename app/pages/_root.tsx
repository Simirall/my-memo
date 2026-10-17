import type { ReactNode } from "react";
import { AppErrorBoundary } from "@/components/app-error-boundary";
import "@/style.css";

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

export default function Root({ children }: { children: ReactNode }) {
  return (
    <html lang="ja">
      <head>
        <meta charSet="utf-8" />
        <meta content="width=device-width, initial-scale=1.0" name="viewport" />
        <meta content="light dark" name="color-scheme" />
        <meta content="#20252e" name="theme-color" />
        <link href="/manifest.webmanifest" rel="manifest" />
        <link href="/icon.svg" rel="icon" type="image/svg+xml" />
        <link href="/icons/apple-touch-icon.png" rel="apple-touch-icon" />
        <script src="/theme-init.js" />

        <script defer src="/pwa-init.js" />
        <JavaScriptRequiredStyle />
      </head>
      <body>
        <JavaScriptRequiredFallback />
        <div id="app-with-javascript">
          <AppErrorBoundary>{children}</AppErrorBoundary>
        </div>
      </body>
    </html>
  );
}

export const getConfig = () => ({ render: "dynamic" as const });
