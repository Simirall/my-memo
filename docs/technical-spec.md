# my-memo 技術仕様書

## 1. システムアーキテクチャ

### 1.1 全体構成図

```
┌─────────────────────────────────────────────────────────────────┐
│                         Client (Browser)                        │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Cloudflare Workers                          │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                      HonoX (SSR)                          │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐ 　  │  │
│  │  │   Routes    │  │  Renderer   │  │   Middleware    │ 　  │  │
│  │  │  (hono/jsx) │  │  (hono/jsx) │  │  (Auth, etc.)   │ 　  │  │
│  │  └─────────────┘  └─────────────┘  └─────────────────┘ 　  │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                │                                │
│         ┌──────────────────────┼──────────────────────┐      　  │
│         ▼                      ▼                      ▼      　  │
│  ┌─────────────┐       ┌─────────────┐       ┌─────────────┐ 　  │
│  │     D1      │       │     R2      │       │ Workers AI  │ 　  │
│  │  (SQLite)   │       │  (Storage)  │       │  (LLM)      │ 　  │
│  └─────────────┘       └─────────────┘       └─────────────┘ 　  │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│              External OAuth Providers                           │
│                      ┌─────────────┐                            │
│                      │   GitHub    │                            │
│                      │   OAuth     │                            │
│                      └─────────────┘                            │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 技術スタック

| レイヤー       | 技術                           | 用途                 |
| -------------- | ------------------------------ | -------------------- |
| Runtime        | Cloudflare Workers             | Edge Runtime         |
| Framework      | HonoX                          | Full-stack Framework |
| View           | hono/jsx                       | JSX Rendering        |
| CSS            | Tailwind CSS v4 + daisyUI v5   | スタイリング         |
| Build          | Vite + @cloudflare/vite-plugin | ビルド・開発サーバー |
| Database       | Cloudflare D1                  | SQLite ベースの DB   |
| Storage        | Cloudflare R2                  | 画像ストレージ       |
| AI             | Cloudflare Workers AI          | URL 要約生成         |
| Authentication | Better Auth                    | ステートレス認証     |

### 1.3 リクエストフロー

1. **ブラウザ** → Cloudflare Workers へリクエスト
2. **HonoX ミドルウェア** でセッション検証（Better Auth）
3. 未認証の場合 → ログイン画面へリダイレクト
4. 認証済みの場合 → ルートハンドラで処理
5. 必要に応じて **D1/R2/Workers AI** へアクセス
6. **hono/jsx** で HTML を SSR レンダリング
7. レスポンスをブラウザへ返却

---

## 2. データベース設計（D1）

### 2.1 ER 図

```
          ┌──────────────┐       ┌──────────────┐
          │  categories  │       │    tags      │
          ├──────────────┤       ├──────────────┤
          │ id (PK)      │       │ id (PK)      │
          │ user_email   │───┐   │ user_email   │───┐
          │ name         │   │   │ name         │   │
          │ created_at   │   │   │ created_at   │   │
          │ updated_at   │   │   │ updated_at   │   │
          └──────────────┘   │   └──────────────┘   │
                             │                      │
                             │                      │
                             │                      │
                             │                      │
                             │ 1:N                  │ 1:N
                             ▼                      ▼
┌──────────────────────────────────────────────────────────────────┐
│                            memos                                 │
├──────────────────────────────────────────────────────────────────┤
│ id (PK)                                                          │
│ user_email ───────────────────────────────────────────┐          │
│ category_id (FK, nullable) ───────────────────────────┼──────────│
│ title                                                 │          │
│ content                                               │          │
│ url (nullable)                                        │          │
│ ai_generated (INT, NOT NULL DEFAULT 0)                │          │
│ created_at                                            │          │
│ updated_at                                            │          │
└──────────────────────────────────────────────────────────────────┘
       │                                    │
       │ N:M                                │ 1:N
       ▼                                    ▼
┌──────────────┐                    ┌──────────────┐
│  memo_tags   │                    │    images    │
├──────────────┤                    ├──────────────┤
│ memo_id (FK) │                    │ id (PK)      │
│ tag_id (FK)  │                    │ user_email   │
│ created_at   │                    │ memo_id (FK) │
└──────────────┘                    │ file_path    │
                                    │ public_url   │
                                    │ created_at   │
                                    └──────────────┘
```

### 2.2 テーブル定義

#### memos

| カラム       | 型   | 制約                                | 説明                      |
| ----------- | ---- | ---------------------------------- | ------------------------ |
| id          | TEXT | PRIMARY KEY                        | UUID v4                  |
| user_email  | TEXT | NOT NULL                           | 所有ユーザー（メールアドレス） |
| category_id | TEXT | FK → categories(id)                | カテゴリ（単一）              |
| title       | TEXT |                                    | メモタイトル                 |
| content     | TEXT | NOT NULL                           | メモ本文（最大 10,000 文字）  |
| url         | TEXT |                                    | 添付 URL                  |
| ai_generated| INTEGER | NOT NULL DEFAULT 0              | AI生成フラグ (0:手動, 1:AI) |
| created_at  | TEXT | NOT NULL DEFAULT CURRENT_TIMESTAMP | 作成日時                   |
| updated_at  | TEXT | NOT NULL DEFAULT CURRENT_TIMESTAMP | 更新日時                   |

**インデックス**:

- `INDEX(user_email, created_at DESC)`

#### categories

| カラム      | 型   | 制約                                | 説明         |
| ---------- | ---- | ---------------------------------- | ----------- |
| id         | TEXT | PRIMARY KEY                        | UUID v4     |
| user_email | TEXT | NOT NULL                           | 所有ユーザー（メールアドレス） |
| name       | TEXT | NOT NULL                           | カテゴリ名    |
| created_at | TEXT | NOT NULL DEFAULT CURRENT_TIMESTAMP | 作成日時     |
| updated_at | TEXT | NOT NULL DEFAULT CURRENT_TIMESTAMP | 更新日時     |

**インデックス**:

- `UNIQUE(user_email, name)`
- `INDEX(user_email)`

#### tags

| カラム     | 型   | 制約                                 | 説明         |
| ---------- | ---- | ---------------------------------- | ----------- |
| id         | TEXT | PRIMARY KEY                        | UUID v4     |
| user_email | TEXT | NOT NULL                           | 所有ユーザー（メールアドレス） |
| name       | TEXT | NOT NULL                           | タグ名       |
| created_at | TEXT | NOT NULL DEFAULT CURRENT_TIMESTAMP | 作成日時     |
| updated_at | TEXT | NOT NULL DEFAULT CURRENT_TIMESTAMP | 更新日時     |

**インデックス**:

- `UNIQUE(user_email, name)`
- `INDEX(user_email)`

#### memo_tags

| カラム       | 型   | 制約                               | 説明     |
| ---------- | ---- | ---------------------------------- | -------- |
| memo_id    | TEXT | NOT NULL, FK → memos(id)           | メモ ID  |
| tag_id     | TEXT | NOT NULL, FK → tags(id)            | タグ ID  |
| created_at | TEXT | NOT NULL DEFAULT CURRENT_TIMESTAMP | 作成日時 |

**インデックス**:

- `PRIMARY KEY(memo_id, tag_id)`
- `INDEX(tag_id)`

#### images

| カラム       | 型   | 制約                                | 説明                      |
| ----------- | ---- | ---------------------------------- | ------------------------ |
| id          | TEXT | PRIMARY KEY                        | UUID v4                  |
| user_email  | TEXT | NOT NULL                           | 所有ユーザー（メールアドレス） |
| memo_id     | TEXT | NOT NULL, FK → memos(id)           | メモ ID                  |
| file_path   | TEXT | NOT NULL                           | R2 オブジェクトキー         |
| public_url  | TEXT |                                    | 公開 URL (任意)            |
| created_at  | TEXT | NOT NULL DEFAULT CURRENT_TIMESTAMP | 作成日時                   |

**インデックス**:

- `INDEX(memo_id)`
- `INDEX(user_email)`

### 2.3 マイグレーション方針

- マイグレーションファイルは `db/migrations/` に配置
- 命名規則: `YYYYMMDDHHMMSS_description.sql`
- D1 の `wrangler d1 migrations` コマンドで管理

---

## 3. API エンドポイント設計

### 3.1 認証（AUTH）

| メソッド   | パス                      | 機能 ID  | 説明                        |
| -------- | ------------------------ | -------- | -------------------------- |
| GET      | /auth/login              | AUTH-001 | ログイン画面表示             |
| GET      | /auth/github             | AUTH-001 | GitHub OAuth 開始          |
| GET      | /auth/github/callback    | AUTH-001 | GitHub OAuth コールバック    |
| POST     | /auth/logout             | AUTH-002 | ログアウト                   |

### 3.2 メモ（MEMO）

| メソッド   | パス               | 機能 ID  | 説明                                                       |
| -------- | ----------------- | -------- | --------------------------------------------------------- |
| GET      | /                 | MEMO-002 | メモ一覧画面                                                |
| GET      | /memos/new        | MEMO-001 | メモ作成画面                                                |
| POST     | /memos            | MEMO-001 | メモ作成処理（multipart/form-data 対応、画像同時アップロード可）    |
| GET      | /memos/:id        | MEMO-003 | メモ詳細画面                                                |
| GET      | /memos/:id/edit   | MEMO-004 | メモ編集画面                                                |
| POST     | /memos/:id        | MEMO-004 | メモ更新処理（multipart/form-data 対応、画像追加可）             |
| POST     | /memos/:id/delete | MEMO-005 | メモ削除処理                                                |

### 3.3 カテゴリ（CAT）

| メソッド   | パス                    | 機能 ID | 説明           |
| -------- | ---------------------- | ------- | ------------- |
| GET      | /categories            | -       | カテゴリ管理画面 |
| POST     | /categories            | CAT-001 | カテゴリ作成     |
| POST     | /categories/:id        | CAT-002 | カテゴリ更新     |
| POST     | /categories/:id/delete | CAT-003 | カテゴリ削除     |

### 3.4 タグ（TAG）

タグはメモ作成・編集時にのみ操作するため、独立した管理画面やAPIエンドポイントは持たない。

### 3.5 画像（IMG）

| メソッド   | パス                               | 機能 ID | 説明                     |
| -------- | --------------------------------- | ------- | ----------------------- |
| GET      | /images/:key                      | IMG-002 | 画像取得                 |
| POST     | /memos/:id/images                 | IMG-001 | 画像追加アップロード（単体）  |
| POST     | /memos/:id/images/:imageId/delete | IMG-003 | 画像削除                |

**備考**: 新規作成時および編集時の画像アップロードは、メモ作成/更新 API (`POST /memos`, `POST /memos/:id`) でも受け付ける。

### 3.6 URL・AI 要約（URL）

| メソッド | パス                          | 機能 ID          | 説明             |
| -------- | ----------------------------- | ---------------- | ---------------- |
| GET      | /memos/url                    | URL-001          | URL 投稿画面     |
| POST     | /memos/url                    | URL-002          | URL 投稿・要約生成・保存処理（オプション: `category_id`） |

**備考**: URL 投稿専用画面から URL を送信し、サーバー側で要約生成を行ってからメモとして保存する。POST `/memos/url` はオプションで `category_id`（カテゴリの UUID 文字列）を受け付けます。`category_id` が指定された場合はリクエストユーザーのカテゴリであることを検証し、問題があれば 400 を返します。正常な場合は `memos.category_id` に保存します。

---

## 4. 認証設計（Better Auth）

### 4.1 認証方式

- **セッション管理**: ステートレスセッション（JWT ベース）
- **トークン保存**: HTTP-only Cookie
- **セッション有効期限**: 7 日間（設定可能）

### 4.2 OAuth フロー

```
┌────────┐     ┌─────────────┐      ┌───────────────┐
│ Client │     │   Workers   │      │ OAuth Provider│
└────────┘     └─────────────┘      └───────────────┘
     │                │                      │
     │ 1. Login Click │                      │
     │───────────────>│                      │
     │                │ 2. Redirect          │
     │                │─────────────────────>│
     │                │                      │
     │                │ 3. User Consent      │
     │<──────────────────────────────────────│
     │                │                      │
     │ 4. Callback    │                      │
     │───────────────>│                      │
     │                │ 5. Token Exchange    │
     │                │─────────────────────>│
     │                │                      │
     │                │ 6. User Info         │
     │                │<─────────────────────│
     │                │                      │
     │                │ 7. Create/Update User│
     │                │ (D1)                 │
     │                │                      │
     │ 8. Set Cookie  │                      │
     │<───────────────│                      │
     │                │                      │
     │ 9. Redirect    │                      │
     │   to /         │                      │
     │<───────────────│                      │
```

### 4.3 Better Auth 設定

```typescript
// 設定イメージ（概要）
const auth = betterAuth({
  database: d1Adapter(env.DB),
  session: {
    strategy: "stateless",
    expiresIn: 60 * 60 * 24 * 7, // 7日
  },
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID as string,
      clientSecret: process.env.GITHUB_CLIENT_SECRET as string,
    },
  },
});
```

### 4.4 認証ミドルウェア

- 全ルート（`/auth/*` を除く）で認証チェック
- 未認証の場合は `/auth/login` へリダイレクト
- 認証済みの場合は `c.set('user', user)` でユーザー情報を Context に設定

---

## 5. ストレージ設計（R2）

### 5.1 バケット構成

| バケット名  | 用途         | アクセス |
| ----------- | ------------ | -------- |
| memo-images | メモ添付画像 | Private  |

### 5.2 オブジェクトキー命名規則

```
{user_email}/{memo_id}/{uuid}.{ext}
```

例: `user%40example.com/123e4567-e89b-12d3-a456-426614174000/7c9e6679-7425-40de-944b-e07fc1f90ae7.jpg`

※ `user_email` はパスとして安全に扱えるよう、必要に応じて URL エンコードした値を利用する。

### 5.3 画像仕様

| 項目               | 仕様                 |
| ------------------ | -------------------- |
| 対応フォーマット   | JPEG, PNG, GIF, WebP |
| 最大ファイルサイズ | 5MB/枚               |
| 最大枚数           | 4 枚/メモ            |
| リサイズ           | なし（MVP）          |
| 保存期間           | メモ削除時に自動削除 |

### 5.4 画像配信

- Workers 経由で配信（認証チェック付き）
- パス: `/images/:key`
- Cache-Control: `private, max-age=31536000`

---

## 6. AI 要約機能設計（Workers AI）

### 6.1 使用モデル

| 項目      | 値                           |
| --------- | ---------------------------- |
| モデル ID | `@cf/qwen/qwen3-30b-a3b-fp8` |
| 選定理由  | コスト最適化、日本語対応     |

### 6.2 処理フロー

```
1. URL 投稿リクエスト
   │
   ▼
2. URL からコンテンツを fetch
   │ - User-Agent を設定
   │ - タイムアウト: 10秒
   │ - 最大サイズ: 1MB
   │
   ▼
3. HTML からテキストを抽出
   │ - <script>, <style> を除去
   │ - メタ情報（title, description）を取得
   │
   ▼
4. Workers AI で要約生成
   │ - 入力: 抽出テキスト（最大4000トークン相当）
   │ - 出力: タイトル、日本語要約（200〜400文字程度）
   │
   ▼
5. メモとして DB に保存
   │ - title: AI 生成タイトル
   │ - content: AI 生成要約
   │ - url: 入力 URL
   │ - category_id: (任意) ユーザーが選択したカテゴリの UUID（指定があれば検証の上保存）
   │ - ai_generated: 1
   │
   ▼
6. 完了画面または詳細画面へリダイレクト
```

### 6.3 プロンプト設計

```
あなたは優秀なアシスタントです。渡された Web 記事のテキストを読み、以下の JSON 形式で出力してください。

{
  "title": "記事の適切な日本語タイトル",
  "summary": "記事の内容の日本語要約（3点の箇条書き）"
}

本文:
{content}
```

### 6.4 エラーハンドリング

| ケース                     | 対応                             |
| -------------------------- | -------------------------------- |
| URL アクセス失敗           | エラーメッセージを表示し、保存しない |
| コンテンツ取得タイムアウト | エラーメッセージを表示し、保存しない |
| AI 要約生成失敗            | エラーメッセージを表示し、保存しない |

### 6.5 セキュリティ対策（SSRF）

Cloudflare Workers の `fetch` API はデフォルトでプライベートネットワークへのアクセスをブロックするが、多層防御として以下の対策を実装する。

- **スキーム制限**: `http:` または `https:` のみに限定（`file:`, `ftp:` 等は拒否）
- **プライベート IP ブロック**: 解決された IP アドレスがプライベート帯域（RFC 1918 等）やループバックアドレスでないことを確認
- **リダイレクト制限**: リダイレクトは追跡しない（`redirect: 'manual'` または `error`）、もしくは追跡時に再度バリデーションを行う
- **メタデータエンドポイント対策**: クラウドプロバイダのメタデータエンドポイント（例: `169.254.169.254`）へのアクセスをブロック

---

## 7. ディレクトリ構成

### 7.1 ディレクトリ構成

```
app/
├── auth.ts                   # Better Auth 設定
├── client.ts                 # クライアントエントリーポイント
├── server.ts                 # サーバーエントリーポイント
├── style.css                 # グローバルスタイル（Tailwind）
├── global.d.ts               # グローバル型定義
│
├── components/               # 共通 UI コンポーネント
│   ├── header.tsx            # ヘッダー
│   └── root-layout.tsx       # ルートレイアウト
│
├── islands/                  # クライアントサイドコンポーネント（Islands）
│   ├── login.tsx             # ログインボタン等
│   ├── logout.tsx            # ログアウトボタン等
│   ├── memo-form.tsx         # メモ作成・編集フォーム
│   ├── image-uploader.tsx    # 画像アップロード
│   ├── category-manager.tsx  # カテゴリ管理
│   └── summary-generator.tsx # 要約生成ボタン
│
├── routes/                   # ファイルベースルーティング
│   ├── _404.tsx              # 404 ページ
│   ├── _error.tsx            # エラーページ
│   ├── _renderer.tsx         # 共通レンダラー
│   ├── index.tsx             # トップページ
│   ├── (auth)/               # 認証関連ページ
│   │   └── login.tsx         # ログインページ
│   ├── memos/                # メモ機能
│   │   ├── index.tsx         # メモ一覧
│   │   ├── new.tsx           # メモ作成
│   │   └── [id]/
│   │       ├── index.tsx     # メモ詳細
│   │       └── edit.tsx      # メモ編集
│   ├── categories/           # カテゴリ機能
│   │   └── index.tsx         # カテゴリ一覧・管理
│   ├── images/               # 画像配信
│   │   └── [key].ts          # 画像取得
│   └── api/                  # API ルート
│       ├── auth/
│       │   └── index.ts      # 認証 API エンドポイント
│       ├── memos/
│       │   ├── index.ts      # メモ作成 API
│       │   └── [id]/
│       │       ├── index.ts  # メモ更新・削除 API
│       │       └── images/
│       │           ├── index.ts      # 画像追加 API
│       │           └── [imageId].ts  # 画像削除 API
│       └── categories/
│           ├── index.ts      # カテゴリ作成 API
│           └── [id].ts       # カテゴリ更新・削除 API
│
└── utils/                    # ユーティリティ
    └── authClient.ts         # 認証クライアント
```

### 7.2 設計方針

| 方針         | 説明                                               |
| ------------ | -------------------------------------------------- |
| HonoX        | ファイルベースルーティングを使用                   |
| Islands      | クライアントサイドのインタラクションは islands/ に配置 |
| 単一責任     | 各ファイルは単一の責任を持つ                       |

---

## 8. セキュリティ仕様

### 8.1 認証・認可

| 項目       | 仕様                                   |
| ---------- | -------------------------------------- |
| 認証方式   | OAuth 2.0（GitHub）         |
| セッション | JWT（HTTP-only Cookie）                |
| 認可       | ユーザーは自分のデータのみアクセス可能 |

### 8.2 CSRF 対策

- Hono の CSRF ミドルウェアを使用
- POST/PUT/DELETE リクエストで CSRF トークン検証
- Secure と SameSite 属性の設定
  - SameSite=Lax/Strict

### 8.3 入力バリデーション

| フィールド | バリデーション                    |
| ---------- | --------------------------------- |
| メモ本文   | 最大 10,000 文字                  |
| カテゴリ名 | 最大 50 文字、空白不可            |
| タグ名     | 最大 30 文字、空白不可                                                                 |
| URL        | URL 形式チェック、最大 2,000 文字、スキーム制限（http/https）、プライベート IP ブロック |
| 画像       | MIME タイプ、サイズ（5MB 以下）                                                        |

### 8.4 レートリミット

| エンドポイント   | 制限               |
| ---------------- | ------------------ |
| AI 要約生成      | 10 回/分/ユーザー  |
| 画像アップロード | 20 回/分/ユーザー  |
| その他           | 100 回/分/ユーザー |

### 8.5 その他

- HTTPS 強制（Cloudflare で自動適用）
- Content-Security-Policy ヘッダー設定
- X-Content-Type-Options: nosniff
- X-Frame-Options: DENY

---

## 9. エラーハンドリング

### 9.1 HTTP ステータスコード

| コード | 用途                             |
| ------ | -------------------------------- |
| 200    | 成功                             |
| 302    | リダイレクト                     |
| 400    | バリデーションエラー             |
| 401    | 未認証                           |
| 403    | 権限なし（他ユーザーのリソース） |
| 404    | リソースが見つからない           |
| 429    | レートリミット超過               |
| 500    | サーバーエラー                   |

### 9.2 エラー画面

- 400/401/403/404: カスタムエラー画面を表示
- 500: 汎用エラー画面を表示（詳細は非表示）
- 開発環境ではスタックトレースを表示

### 9.3 ロギング

- エラー発生時は `console.error` でログ出力
- Cloudflare Workers Logs で確認可能

---

## 10. 環境変数・シークレット

### 10.1 wrangler.jsonc 設定

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "my-memo",
  "compatibility_date": "2025-08-03",
  "main": "./dist/index.js",

  // D1 Database
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "my-memo-db",
      "database_id": "<D1_DATABASE_ID>"
    }
  ],

  // R2 Bucket
  "r2_buckets": [
    {
      "binding": "BUCKET",
      "bucket_name": "memo-images"
    }
  ],

  // Workers AI
  "ai": {
    "binding": "AI"
  }
}
```

### 10.2 シークレット（Cloudflare Secrets）

| 名前                    | 説明                           |
| ----------------------- | ------------------------------ |
| GITHUB_CLIENT_ID       | GitHub OAuth Client ID      |
| GITHUB_CLIENT_SECRET   | GitHub OAuth Secret         |
| AUTH_SECRET            | Better Auth 署名用シークレット |

### 10.3 シークレット設定コマンド

```bash
wrangler secret put GITHUB_CLIENT_ID
wrangler secret put GITHUB_CLIENT_SECRET
wrangler secret put AUTH_SECRET
```

### 10.4 Cloudflare Bindings 型定義

```typescript
// src/types/env.d.ts
interface CloudflareBindings {
  DB: D1Database;
  BUCKET: R2Bucket;
  AI: Ai;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  AUTH_SECRET: string;
}
```

---

## 改訂履歴

| 版  | 日付       | 内容     |
| --- | ---------- | -------- |
| 0.1 | 2025-12-18 | 初版作成 |
| 0.2 | 2025-12-19 | OAuthプロバイダー変更 |
| 0.3 | 2025-12-23 | ユーザー識別子を email に変更 |
