# Phase 1: 認証機能

## 1. 概要

本フェーズでは、アプリケーションの基盤となる認証機能を実装します。
Better Auth を使用し、GitHub アカウントによるソーシャルログインを実現します。
また、ステートレスなセッション管理と、未認証ユーザーのアクセス制限（ミドルウェア）を実装します。

## 2. 実装タスクリスト

### 2.1 データベース (D1)

- [ ] `users` テーブルのマイグレーションファイル作成 (`db/migrations/0001_create_users.sql`)
- [ ] ローカル D1 へのマイグレーション適用

### 2.2 ライブラリ・設定

- [ ] Better Auth 関連パッケージのインストール
- [ ] `app/auth.ts` の作成（Better Auth 設定）
- [ ] 環境変数 (`wrangler.jsonc`, `.dev.vars`) の設定
  - `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`
  - `AUTH_SECRET`

### 2.3 バックエンド (HonoX)

- [ ] 認証用ルートハンドラの実装 (`app/routes/api/auth/index.ts`)
  - Better Auth のハンドラを Hono にマウント
- [ ] 認証ミドルウェアの実装 (`app/routes/_middleware.ts`)
  - セッション検証ロジック
  - 未認証時の `/login` リダイレクト処理

### 2.4 フロントエンド (HonoX/Island)

- [ ] ログイン画面コンポーネントの実装 (`app/routes/(auth)/login.tsx`, `app/islands/login.tsx`)
  - daisyUI を使用したデザイン
  - GitHub ログインボタン
- [ ] 共通レイアウトコンポーネントの実装 (`app/routes/_renderer.tsx`)
  - ヘッダーにユーザーアイコンとログアウトボタンを配置

## 3. 詳細設計

### 3.1 データベーススキーマ

#### users テーブル

| カラム      | 型   | 制約        | 説明                          |
| ----------- | ---- | ----------- | ----------------------------- |
| id          | TEXT | PRIMARY KEY | UUID v4                       |
| provider_id | TEXT | NOT NULL    | OAuth プロバイダのユーザー ID |
| provider    | TEXT | NOT NULL    | github                        |
| email       | TEXT | NOT NULL    | メールアドレス                |
| name        | TEXT | NOT NULL    | 表示名                        |
| avatar_url  | TEXT |             | アバター画像 URL              |
| created_at  | TEXT | NOT NULL    | 作成日時                      |
| updated_at  | TEXT | NOT NULL    | 更新日時                      |

**インデックス**:

- `UNIQUE(provider, provider_id)`
- `INDEX(email)`

### 3.2 API エンドポイント (Better Auth 自動生成)

Better Auth により以下のエンドポイントが自動的に提供されます（Hono の `/api/auth/*` 等にマウント）。

- `GET /api/auth/signin/github`: GitHub ログイン開始
- `GET /api/auth/callback/github`: GitHub コールバック
- `POST /api/auth/signout`: ログアウト
- `GET /api/auth/session`: セッション取得

### 3.3 UI コンポーネント設計

#### LoginPage.tsx

- **パス**: `/auth/login`
- **レイアウト**: 画面中央にカードを表示
- **要素**:
  - タイトル: "my-memo Login"
  - ボタン 1: "Sign in with GitHub" (アイコン付き)
- **挙動**: ボタンクリックで各プロバイダのログインエンドポイントへ遷移

#### Layout.tsx

- **Props**: `{ children, user }`
- **ヘッダー**:
  - 左側: ロゴ（クリックでトップへ）
  - 右側:
    - 未ログイン時: 表示なし（またはログイン画面ではヘッダー自体を変える）
    - ログイン時: ユーザーアバター、ログアウトボタン
- **ログアウト処理**: `betterAuth.signOut()` を呼び出し、完了後に `/auth/login` へリダイレクト

### 3.4 認証ミドルウェア (src/middleware/auth.ts)

```typescript
import { createMiddleware } from "hono/factory";
import { auth } from "@/lib/auth";

export const authMiddleware = createMiddleware(async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) {
    return c.redirect("/auth/login");
  }
  c.set("user", session.user);
  await next();
});
```
