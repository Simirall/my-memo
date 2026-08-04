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
| Authentication | Better Auth                    | D1データベースセッション認証 |

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
          │ user_id      │───┐   │ user_id      │───┐
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
│ user_id ──────────────────────────────────────────────┐          │
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
│ tag_id (FK)  │                    │ user_id      │
│ created_at   │                    │ memo_id (FK) │
└──────────────┘                    │ file_path    │
                                    │ public_url   │
                                    │ created_at   │
                                    └──────────────┘
```

### 2.2 テーブル定義

#### Better Auth 管理テーブル

Better AuthのDrizzleアダプターが以下のテーブルをD1で管理する。

| テーブル | 主なカラム | 用途 |
| -------- | ---------- | ---- |
| user | id, name, email, email_verified, image, role, banned, ban_reason, ban_expires, plan_id, created_at, updated_at | ユーザー・管理者role・プラン |
| session | id, expires_at, token, user_id, created_at, updated_at, ip_address, user_agent, impersonated_by | データベースセッション |
| account | id, account_id, provider_id, user_id, access_token, refresh_token, created_at, updated_at | GitHub OAuthアカウント |
| verification | id, identifier, value, expires_at, created_at, updated_at | 認証検証情報 |

#### 認可・プランテーブル

| テーブル | 主なカラム | 用途 |
| -------- | ---------- | ---- |
| plans | id, code, name, is_default, is_active | プラン定義 |
| plan_limits | plan_id, metric, limit_value | プランごとの機能上限。`NULL`は無制限 |
| usage_counters | user_id, metric, period_start, used | AI要約など期間単位の使用量 |
| authorization_audit_logs | actor_user_id, target_user_id, action, previous_value, current_value, created_at | 管理者・プラン変更の監査履歴 |

`user.plan_id`はプランを必須とする。新規ユーザー作成時に、`plans.is_default = 1`かつ`is_active = 1`のプランをDBから選択して割り当てる。初期seedの既定プランは`free`だが、既定プランの変更は`is_default`の更新で行い、アプリケーションコードや`user.plan_id`のDBデフォルト値にプランIDを固定しない。既定プランが存在しない場合、または必須limitが不足する場合はユーザー作成を失敗させる。SQLiteのALTER TABLE制約を補うため、migrationではプラン参照と必須性をトリガーでも検証する。

`memos.user_id`と`categories.user_id`は`user.id`を参照する外部キーである。

#### memos

| カラム       | 型   | 制約                                | 説明                      |
| ----------- | ---- | ---------------------------------- | ------------------------ |
| id          | TEXT | PRIMARY KEY                        | UUID v4                  |
| user_id     | TEXT | NOT NULL, FK → user(id)            | 所有ユーザー |
| category_id | TEXT | FK → categories(id)                | カテゴリ（単一）              |
| title       | TEXT |                                    | メモタイトル                 |
| content     | TEXT | NOT NULL                           | メモ本文（最大 10,000 文字）  |
| url         | TEXT |                                    | 添付 URL                  |
| ai_generated| INTEGER | NOT NULL DEFAULT 0              | AI生成フラグ (0:手動, 1:AI) |
| created_at  | TEXT | NOT NULL DEFAULT CURRENT_TIMESTAMP | 作成日時                   |
| updated_at  | TEXT | NOT NULL DEFAULT CURRENT_TIMESTAMP | 更新日時                   |

**インデックス**:

- `INDEX(user_id, created_at DESC)`

#### categories

| カラム      | 型   | 制約                                | 説明         |
| ---------- | ---- | ---------------------------------- | ----------- |
| id         | TEXT | PRIMARY KEY                        | UUID v4     |
| user_id    | TEXT | NOT NULL, FK → user(id)            | 所有ユーザー |
| name       | TEXT | NOT NULL                           | カテゴリ名    |
| created_at | TEXT | NOT NULL DEFAULT CURRENT_TIMESTAMP | 作成日時     |
| updated_at | TEXT | NOT NULL DEFAULT CURRENT_TIMESTAMP | 更新日時     |

**インデックス**:

- `UNIQUE(user_id, name)`
- `INDEX(user_id)`

#### tags

| カラム     | 型   | 制約                                 | 説明         |
| ---------- | ---- | ---------------------------------- | ----------- |
| id         | TEXT | PRIMARY KEY                        | UUID v4     |
| user_id    | TEXT | NOT NULL, FK → user(id)            | 所有ユーザー |
| name       | TEXT | NOT NULL                           | タグ名       |
| created_at | TEXT | NOT NULL DEFAULT CURRENT_TIMESTAMP | 作成日時     |
| updated_at | TEXT | NOT NULL DEFAULT CURRENT_TIMESTAMP | 更新日時     |

**インデックス**:

- `UNIQUE(user_id, name)`
- `INDEX(user_id)`

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
| user_id     | TEXT | NOT NULL, FK → user(id)            | 所有ユーザー |
| memo_id     | TEXT | NOT NULL, FK → memos(id)           | メモ ID                  |
| file_path   | TEXT | NOT NULL                           | R2 オブジェクトキー         |
| public_url  | TEXT |                                    | 公開 URL (任意)            |
| created_at  | TEXT | NOT NULL DEFAULT CURRENT_TIMESTAMP | 作成日時                   |

**インデックス**:

- `INDEX(memo_id)`
- `INDEX(user_id)`

### 2.3 マイグレーション方針

- マイグレーションファイルは `migrations/` に配置
- Drizzle Kitで生成し、D1のマイグレーションとして管理
- D1 の `wrangler d1 migrations` コマンドで管理

---

## 3. API エンドポイント設計

### 3.1 認証（AUTH）

| メソッド   | パス                      | 機能 ID  | 説明                        |
| -------- | ------------------------ | -------- | -------------------------- |
| GET      | /login                   | AUTH-001 | ログイン画面表示             |
| GET/POST | /api/auth/*              | AUTH-001/002 | Better Auth OAuth・セッションAPI |

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

| メソッド | パス                  | 機能 ID | 説明                                           |
| -------- | --------------------- | ------- | ---------------------------------------------- |
| POST     | /api/memos/:id/tags   | TAG-002 | 対象メモのタグ集合を一括置換                   |
| GET      | /tags/:id             | FILTER-002 | タグを持つメモの検索結果型一覧                 |

タグは独立した管理画面を持たず、メモ作成フォームまたはメモカードの編集モーダルから追加する。タグ名の変更・タグレコード自体の削除は行わない。`POST /api/memos/:id/tags` は `{ "tags": ["タグ名"] }` を受け取り、所有ユーザーのタグを再利用または自動作成した後、対象メモとの関連を置き換える。1メモあたり最大10個、タグ名は最大30文字・空白不可とする。

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

- **セッション管理**: D1データベースセッション（Better Auth）
- **セッションCookie**: HTTP-only Cookie（セッション識別用トークン）
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
// app/auth.ts（概要）
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

const db = drizzle(env.MY_MEMO_D1, { schema });
const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "sqlite",
    schema: {
      user: schema.userTable,
      session: schema.sessionTable,
      account: schema.accountTable,
      verification: schema.verificationTable,
    },
  }),
  session: {
    cookieCache: {
      maxAge: 60 * 60 * 24 * 7, // 7日
      refreshCache: true,
    },
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

- 全ルート（`/login*`、`/api/auth/*` 等の公開パスを除く）で認証チェック
- 未認証の場合は `/login` へリダイレクト
- 認証済みの場合は `c.set('user', user)` でユーザー情報を Context に設定

---

## 5. ストレージ設計（R2）

### 5.1 バケット構成

| バケット名  | 用途         | アクセス |
| ----------- | ------------ | -------- |
| memo-images | メモ添付画像 | Private  |

### 5.2 オブジェクトキー命名規則

```
{user_id}/{memo_id}/{uuid}.{ext}
```

例: `user_abc123/123e4567-e89b-12d3-a456-426614174000/7c9e6679-7425-40de-944b-e07fc1f90ae7.jpg`

※ Better Authの`user.id`を使用し、メールアドレスをストレージキーに含めない。

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
| セッション | D1データベースセッション（HTTP-only Cookie） |
| 認可       | ユーザー自身のデータのみアクセス可能。管理者はroleにより管理機能へアクセス可能 |
| 管理者role | Better Auth Adminプラグインの`user`/`admin` |
| 権限変更   | 標準Admin APIを無効化し、監査対象の独自APIに限定 |
| プラン上限 | メモ100件、AI要約10回/月（free初期値） |

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
  "compatibility_date": "2025-11-17",
  "main": "./dist/index.js",

  // D1 Database
  "d1_databases": [
    {
       "binding": "MY_MEMO_D1",
       "database_name": "my_memo_d1",
       "database_id": "<D1_DATABASE_ID>",
       "migrations_dir": "migrations"
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
| BETTER_AUTH_URL       | Better AuthのベースURL       |
| BETTER_AUTH_SECRET     | Better Auth署名用シークレット |

### 10.3 シークレット設定コマンド

```bash
wrangler secret put GITHUB_CLIENT_ID
wrangler secret put GITHUB_CLIENT_SECRET
wrangler secret put BETTER_AUTH_URL
wrangler secret put BETTER_AUTH_SECRET
```

### 10.4 Cloudflare Bindings 型定義

```typescript
// src/types/env.d.ts
interface CloudflareBindings {
  MY_MEMO_D1: D1Database;
  AI: Ai;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  BETTER_AUTH_URL: string;
  BETTER_AUTH_SECRET: string;
}
```

---

## 改訂履歴

| 版  | 日付       | 内容     |
| --- | ---------- | -------- |
| 0.1 | 2025-12-18 | 初版作成 |
| 0.2 | 2025-12-19 | OAuthプロバイダー変更 |
| 0.3 | 2025-12-23 | ユーザー識別子を email に変更 |
| 0.4 | 2026-08-01 | D1データベースセッション、Better Authテーブル、user_id設計を反映 |
