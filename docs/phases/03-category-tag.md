# Phase 3: カテゴリ・タグ機能

## 1. 概要

メモを整理・分類するためのカテゴリ機能とタグ機能を実装します。
カテゴリは 1 つのメモにつき最大 1 つ設定でき、タグは複数設定可能です。
また、メモ作成・編集画面でこれらを指定できるようにします。

## 2. 実装タスクリスト

### 2.1 データベース (D1)

- [ ] `categories` テーブルのマイグレーション作成 (`db/migrations/0002_create_categories.sql`)
- [ ] `tags` テーブルのマイグレーション作成 (`db/migrations/0003_create_tags.sql`)
- [ ] `memo_tags` テーブル（中間テーブル）のマイグレーション作成 (`db/migrations/0004_create_memo_tags.sql`)
- [ ] ローカル D1 へのマイグレーション適用

### 2.2 バックエンド (HonoX)

- [ ] カテゴリ機能の実装 (`app/features/category/`, `app/routes/categories/`)
  - Repository: CRUD 処理
  - Routes: カテゴリ一覧取得、作成、削除 API
- [ ] タグ機能の実装 (`app/features/tag/`)
  - Repository: CRUD 処理、名前による検索または作成（FindOrCreate）
- [ ] メモ機能の拡張 (`app/features/memo/`)
  - Repository: `create`, `update` 時にカテゴリ ID とタグ配列を処理するロジック追加
  - Repository: `findAll`, `findById` 時にカテゴリとタグ情報を JOIN して取得するロジック追加
  - Routes: リクエストボディのバリデーション更新

### 2.3 フロントエンド (HonoX)

- [ ] カテゴリ管理画面 (`app/routes/categories/index.tsx`)
- [ ] メモフォームの拡張 (`app/routes/memos/new.tsx`, `app/routes/memos/[id]/edit.tsx`)
  - カテゴリ選択 UI 追加
  - タグ入力 UI 追加
- [ ] メモ表示の拡張 (`app/components/MemoCard.tsx`, `app/routes/memos/[id].tsx`)
  - カテゴリ・タグのバッジ表示

## 3. 詳細設計

### 3.1 データベーススキーマ

#### categories テーブル

| カラム     | 型   | 制約         | 説明         |
| ---------- | ---- | ------------ | ------------ |
| id         | TEXT | PRIMARY KEY  | UUID v4      |
| user_id    | TEXT | NOT NULL, FK | 所有ユーザー |
| name       | TEXT | NOT NULL     | カテゴリ名   |
| created_at | TEXT | NOT NULL     |              |

#### tags テーブル

| カラム     | 型   | 制約         | 説明         |
| ---------- | ---- | ------------ | ------------ |
| id         | TEXT | PRIMARY KEY  | UUID v4      |
| user_id    | TEXT | NOT NULL, FK | 所有ユーザー |
| name       | TEXT | NOT NULL     | タグ名       |
| created_at | TEXT | NOT NULL     |              |

#### memo_tags テーブル

| カラム      | 型                | 制約         | 説明       |
| ----------- | ----------------- | ------------ | ---------- |
| memo_id     | TEXT              | NOT NULL, FK | メモ ID    |
| tag_id      | TEXT              | NOT NULL, FK | タグ ID    |
| PRIMARY KEY | (memo_id, tag_id) |              | 複合主キー |

### 3.2 型定義 (Zod)

```typescript
import { z } from "zod";

// カテゴリ作成
export const createCategorySchema = z.object({
  name: z
    .string()
    .min(1, "カテゴリ名は必須です")
    .max(50, "50文字以内で入力してください"),
});

// メモ作成（更新）
export const createMemoSchema = z.object({
  content: z.string().min(1).max(10000),
  categoryId: z.string().optional(), // 選択されたカテゴリID
  tags: z.string().optional(), // カンマまたはスペース区切りの文字列として受け取り、サーバー側でパースする
});
```

### 3.3 UI コンポーネント設計

#### CategoryManagePage.tsx

- **パス**: `/categories`
- **機能**:
  - 既存カテゴリの一覧表示
  - 新規カテゴリ追加フォーム（インラインまたはモーダル）
  - 削除ボタン
- **デザイン**: シンプルなリスト形式。

#### MemoFormPage.tsx (拡張)

- **カテゴリ選択**:
  - `<select>` 要素を使用。
  - ユーザーが作成したカテゴリ一覧を `option` として表示。
  - 「未分類」の選択肢も用意。
- **タグ入力**:
  - シンプルなテキスト入力フィールド (`input type="text"`)。
  - プレースホルダー: "タグ 1, タグ 2, タグ 3"
  - サーバーサイドでカンマ(`,`)やスペースで分割して処理する。

#### MemoCard.tsx / MemoDetailPage.tsx (拡張)

- **カテゴリ表示**:
  - メモ上部または下部にバッジ表示。
  - daisyUI: `<div class="badge badge-primary">カテゴリ名</div>`
- **タグ表示**:
  - カテゴリの横に並べて表示。
  - daisyUI: `<div class="badge badge-outline">#タグ名</div>`
