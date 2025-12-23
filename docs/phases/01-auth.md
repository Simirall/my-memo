# Phase 1: 認証機能

## 1. 概要

本フェーズでは、アプリケーションの基盤となる認証機能を実装します。
Better Auth を使用し、GitHub アカウントによるソーシャルログインを実現します。
また、ステートレスなセッション管理と、未認証ユーザーのアクセス制限（ミドルウェア）を実装します。

## 2. 実装タスクリスト

### 2.1 ライブラリ・設定

- [x] Better Auth 関連パッケージのインストール
- [x] `app/auth.ts` の作成（Better Auth 設定）
- [x] 環境変数 (`wrangler.jsonc`, `.dev.vars`) の設定
  - `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`

### 2.2 バックエンド (HonoX)

- [x] 認証用ルートハンドラの実装 (`app/routes/api/auth/index.ts`)
  - Better Auth のハンドラを Hono にマウント
- [x] 認証ミドルウェアの実装 (`app/server.ts`)
  - セッション検証ロジック
  - 未認証時の `/login` リダイレクト処理

### 2.3 フロントエンド (HonoX/Island)

- [x] ログイン画面コンポーネントの実装 (`app/routes/(auth)/login.tsx`, `app/islands/login.tsx`)
  - daisyUI を使用したデザイン
  - GitHub ログインボタン
- [x] 共通レイアウトコンポーネントの実装 (`app/components/root-layout.tsx`)
  - ヘッダーにユーザーアイコンとログアウトボタンを配置

## 3. 詳細設計

### 3.1 API エンドポイント (Better Auth 自動生成)

Better Auth により以下のエンドポイントが自動的に提供されます（Hono の `/api/auth/*` 等にマウント）。

- `GET /api/auth/signin/github`: GitHub ログイン開始
- `GET /api/auth/callback/github`: GitHub コールバック
- `POST /api/auth/signout`: ログアウト
- `GET /api/auth/session`: セッション取得
