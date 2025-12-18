# アーキテクチャ

## Infrastructure

- Cloudflare Stack を利用
  - Cloudflare Workers(Edge Runtime)
  - Cloudflare D1(SQL Database)
  - Cloudflare R2(S3 Compatible Storage)
  - Cloudflare Workers AI

## Programming Language, Framework, Library

- TypeScript
- Hono
  - Cloudflare Bindings を利用
  - ページは SSR、hono/jsx でレンダリング
- Vite
  - Cloudflare Vite Plugin を利用
- Tailwind CSS
  - サーバーサイドでレンダリングするため、領域に依存しない Tailwind CSS を利用
  - コンポーネントライブラリとして daisyUI を利用
- Auth
  - Better Auth のステートレス認証を利用
  - https://www.better-auth.com/docs/concepts/session-management#stateless-session-management
