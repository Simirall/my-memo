# Phase 3: カテゴリ・タグ機能

## 1. 概要

メモを整理・分類するためのカテゴリ機能とタグ機能を実装します。
カテゴリは 1 つのメモにつき最大 1 つ設定でき、タグは複数設定可能です。
また、メモ作成時とメモ一覧カードのタグ編集モーダルでこれらを指定できるようにします。

## 2. 実装タスクリスト

### 2.1 データベース (D1)

- [x] `categories` テーブルのマイグレーション作成（`migrations/0000_fixed_paladin.sql`に統合）
- [x] `tags` テーブルのマイグレーション作成（`migrations/0003_greedy_spitfire.sql`）
- [x] `memo_tags` テーブル（中間テーブル）のマイグレーション作成
- [x] ローカル D1 へのマイグレーション適用

### 2.2 バックエンド (HonoX)

- [ ] カテゴリ機能の実装 (`app/features/category/`, `app/routes/categories/`)
  - Repository: CRUD 処理
  - Routes: カテゴリ一覧取得、作成、削除 API
- [x] タグ機能の実装（`app/utils/tags.ts`、`app/routes/api/memos/index.ts`）
  - 所有ユーザー単位の FindOrCreate とタグ集合の一括置換
  - 1メモ最大10個、タグ名最大30文字、空白不可
- [x] メモ機能の拡張
  - 作成・更新時にタグ配列を処理
  - 全件・カテゴリ別・タグ別取得時にタグ情報を JOIN
  - D1 batch によるメモ作成とタグ関連の原子保存

### 2.3 フロントエンド (HonoX)

- [ ] カテゴリ管理画面 (`app/routes/categories/index.tsx`)
- [x] メモフォームの拡張
  - 通常メモ・URL要約の作成フォームに候補付きチップ入力を追加
- [x] メモ表示の拡張
  - タグバッジを `/tags/:id` へのリンクとして表示
  - カード内モーダルでタグの付け外しを実装
- [x] タグ別結果ページ（`/tags/:id`）

## 3. 詳細設計

### 3.1 データベーススキーマ

#### categories テーブル

| カラム     | 型   | 制約         | 説明         |
| ---------- | ---- | ------------ | ------------ |
| id         | TEXT | PRIMARY KEY  | UUID v4      |
| user_id    | TEXT | NOT NULL, FK → user(id) | 所有ユーザー |
| name       | TEXT | NOT NULL     | カテゴリ名   |
| created_at | TEXT | NOT NULL     |              |
| updated_at | TEXT | NOT NULL     |              |

#### tags テーブル

| カラム     | 型   | 制約         | 説明         |
| ---------- | ---- | ------------ | ------------ |
| id         | TEXT | PRIMARY KEY  | UUID v4      |
| user_id    | TEXT | NOT NULL, FK → user(id) | 所有ユーザー |
| name       | TEXT | NOT NULL     | タグ名       |
| created_at | TEXT | NOT NULL     |              |
| updated_at | TEXT | NOT NULL     |              |

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
  title: z.string().max(255).optional(),
  content: z.string().min(1).max(10000),
  categoryId: z.string().optional(), // 選択されたカテゴリID
  tags: z.array(z.string()).max(10), // JSON化したタグ名配列
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
  - 既存候補付きのチップ入力を使用する。
  - Enterまたは候補クリックで選択し、×で解除する。
  - 未登録名もEnterで追加し、保存時に自動作成する。

#### MemoCard.tsx / MemoDetailPage.tsx (拡張)

- **カテゴリ表示**:
  - メモ上部または下部にバッジ表示。
  - daisyUI: `<div class="badge badge-primary">カテゴリ名</div>`
- **タグ表示**:
  - カテゴリの横に並べて表示する。
  - daisyUIの `badge badge-soft badge-info` を使い、バッジクリックで `/tags/:id` へ遷移する。
  - 横の「タグを編集」ボタンでネイティブ `dialog` を開く。
