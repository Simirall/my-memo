# Phase 6: DBセッション管理への移行

> ステータス: 実装・基本動作確認済み（ローカルD1の再適用のみ未実施）

## 1. 概要

Better Auth のセッション管理をステートレス（JWTベース）からデータベースセッション管理へ移行した。
これにより、ユーザー情報をD1に永続化し、将来的なプラン管理やユーザー単位の機能制御の基盤を整備する。

現在は開発中で自分のデータのみが存在するため、既存データの互換性・マイグレーションは考慮せず、完全に新しい設計へ移行する。

## 2. 移行前の状態

- Better Auth をステートレスセッション（JWTベース）で運用していた
- `auth.ts` にデータベースアダプター未設定
- D1 には `memos`, `categories` テーブルのみ存在していた
- ユーザー識別に `user_email`（メールアドレス文字列）を使用していた

## 3. 移行後の設計方針

- Better Auth が管理する `user`, `session`, `account`, `verification` テーブルをD1に追加
- Drizzle アダプターで Better Auth とD1を接続
- ユーザー識別子を `user_email` → `userId`（Better Auth の user.id）に変更
- `memos`, `categories` テーブルに `user_id` カラムを追加し、`user` テーブルへの外部キーとする

## 4. 実装タスクリスト

### 4.1 Better Auth 用テーブルのスキーマ定義

- [x] `app/schema.ts` に Better Auth 必須テーブルを追加
  - `user` テーブル（id, name, email, emailVerified, image, createdAt, updatedAt）
  - `session` テーブル（id, expiresAt, token, createdAt, updatedAt, ipAddress, userAgent, userId）
  - `account` テーブル（id, accountId, providerId, userId, accessToken, refreshToken, etc.）
  - `verification` テーブル（id, identifier, value, expiresAt, createdAt, updatedAt）
- [x] テーブル名・カラム名は Better Auth のデフォルト規約に合わせる（snake_case）

### 4.2 既存テーブルのスキーマ変更

- [x] `memos` テーブル: `user_email` → `user_id`（TEXT, NOT NULL, FK → user(id)）に変更
- [x] `categories` テーブル: `user_email` → `user_id`（TEXT, NOT NULL, FK → user(id)）に変更
- [x] インデックスを `user_id` ベースに更新
  - `memos`: `INDEX(user_id, created_at)`
  - `categories`: `INDEX(user_id)`
  - カテゴリ名は`UNIQUE(user_id, name)`

### 4.3 auth.ts の更新

- [x] `drizzle-orm/d1` を使って D1 から Drizzle インスタンスを生成
- [x] `better-auth/adapters/drizzle` の `drizzleAdapter` を設定
- [x] ステートレスセッション固有の設定を削除し、DBセッション設定に変更
- [x] `cookieCache` はパフォーマンス最適化のため維持（DB問い合わせ頻度を削減）

```typescript
// 変更後のイメージ
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export const getAuth = (env: Cloudflare.Env) => {
  const db = drizzle(env.MY_MEMO_D1, { schema });
  return betterAuth({
    database: drizzleAdapter(db, { provider: "sqlite" }),
    trustedOrigins: ["http://localhost:5173"],
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    socialProviders: {
      github: {
        clientId: env.GITHUB_CLIENT_ID,
        clientSecret: env.GITHUB_CLIENT_SECRET,
      },
    },
    session: {
      cookieCache: {
        maxAge: 60 * 60 * 24 * 7,
        refreshCache: true,
      },
    },
  });
};
```

### 4.4 アプリケーションコードの修正

ユーザー識別子を `user.email` → `user.id` に変更する。

対象ファイル:

- [x] `app/routes/index.tsx` — メモ一覧取得の where 条件
- [x] `app/routes/memos/create.tsx` — カテゴリ取得の where 条件
- [x] `app/routes/memos/url-summary.tsx` — カテゴリ取得の where 条件
- [x] `app/routes/categories/index.tsx` — カテゴリ一覧取得の where 条件
- [x] `app/routes/categories/[id].tsx` — カテゴリ詳細取得の where 条件
- [x] `app/routes/api/memos/index.ts` — メモ作成・削除時のユーザー識別
- [x] `app/routes/api/memos/memoSchema.ts` — `userEmail` → `userId` のスキーマ変更
- [x] `app/routes/api/categories/index.ts` — カテゴリ作成・削除時のユーザー識別
- [x] `app/routes/api/categories/categoriesSchema.ts` — `userEmail` → `userId` のスキーマ変更

### 4.5 マイグレーション

- [x] 既存のマイグレーションファイルをリセット（開発中のため全削除して再生成）
- [x] `drizzle-kit generate` で新しいマイグレーションを生成
- [x] ローカル D1 のデータをリセット（`wrangler d1 execute --local`）
- [x] マイグレーション適用を確認

### 4.6 ドキュメント更新

- [x] `docs/architecture.md` — 「ステートレス認証」→「DBセッション認証」に変更
- [x] `docs/technical-spec.md` — 認証方式・ER図・テーブル定義の更新
- [x] `docs/spec.md` — AUTH-003 の説明を「DBセッション管理」に更新
- [x] `docs/phases/01-auth.md` — ステートレスに関する記述を更新

## 5. 実施順序

```
Step 1: スキーマ定義（4.1 + 4.2）
  ↓
Step 2: マイグレーション生成・適用（4.5）
  ↓
Step 3: auth.ts の更新（4.3）
  ↓
Step 4: アプリケーションコードの修正（4.4）
  ↓
Step 5: 動作確認（ログイン → メモ・カテゴリの CRUD）
  ↓
Step 6: ドキュメント更新（4.6）
```

## 6. 影響範囲

| 区分 | ファイル | 変更内容 |
|------|---------|---------|
| スキーマ | `app/schema.ts` | Better Auth テーブル追加 + 既存テーブルの `user_email` → `user_id` |
| 認証 | `app/auth.ts` | Drizzle アダプター設定追加 |
| 認証API | `app/routes/api/auth/index.ts` | 変更不要 |
| ミドルウェア | `app/server.ts` | 変更不要（`auth.api.getSession` のI/Fは同一） |
| 型定義 | `app/global.d.ts` | 変更不要（`User`, `Session` 型は同一） |
| ルート | `app/routes/` 配下全般 | `user.email` → `user.id` の参照変更 |
| API | `app/routes/api/` 配下 | `userEmail` → `userId` の参照・スキーマ変更 |
| マイグレーション | `migrations/` | 全リセット＋再生成 |
| ドキュメント | `docs/` 配下 | 認証方式の記述更新 |

## 7. 注意事項

- `server.ts` と `global.d.ts` は変更不要。Better Auth の `getSession` API は両方式で共通のインターフェースを提供する
- `cookieCache` を継続利用することで、毎リクエストのDB問い合わせを抑えつつ、セッションの永続化メリットを得られる
- 開発中のため、既存のD1データは全リセットして問題ない
