# Phase 2: メモ基本機能

## 1. 概要

本フェーズでは、アプリケーションの中核となるメモの CRUD（作成、読み取り、更新、削除）機能を実装します。
カテゴリ、タグ、画像、URL 要約などの付加機能は後のフェーズで実装するため、ここではテキスト本文のみを扱います。

## 2. 実装タスクリスト

### 2.1 データベース (D1)

- [ ] `memos` テーブルのマイグレーションファイル作成 (`db/migrations/0002_create_memos.sql`)
- [ ] ローカル D1 へのマイグレーション適用

### 2.2 バックエンド (Hono)

- [ ] メモ機能用ディレクトリ構成の整備 (`src/features/memo/`)
- [ ] DB アクセス層（Repository）の実装 (`src/features/memo/repository.ts`)
  - `findAllByUserId(userId)`
  - `findById(id)`
  - `create(data)`
  - `update(id, data)`
  - `delete(id)`
- [ ] ルートハンドラの実装 (`src/features/memo/routes.ts`)
  - `GET /`: メモ一覧表示
  - `GET /memos/new`: 作成画面表示
  - `POST /memos`: メモ作成処理
  - `GET /memos/:id`: 詳細画面表示
  - `GET /memos/:id/edit`: 編集画面表示
  - `POST /memos/:id`: メモ更新処理
  - `POST /memos/:id/delete`: メモ削除処理

### 2.3 フロントエンド (Hono/JSX)

- [ ] メモ一覧ページ (`src/features/memo/MemoListPage.tsx`)
- [ ] メモ詳細ページ (`src/features/memo/MemoDetailPage.tsx`)
- [ ] メモ作成/編集ページ (`src/features/memo/MemoFormPage.tsx`)
- [ ] メモカードコンポーネント (`src/features/memo/MemoCard.tsx`)

## 3. 詳細設計

### 3.1 データベーススキーマ

#### memos テーブル

| カラム      | 型   | 制約         | 説明                         |
| ----------- | ---- | ------------ | ---------------------------- |
| id          | TEXT | PRIMARY KEY  | UUID v4                      |
| user_id     | TEXT | NOT NULL, FK | 所有ユーザー                 |
| category_id | TEXT | FK           | カテゴリ（Phase 3 で使用）   |
| content     | TEXT | NOT NULL     | メモ本文（最大 10,000 文字） |
| url         | TEXT |              | 添付 URL（Phase 5 で使用）   |
| url_summary | TEXT |              | AI 要約（Phase 5 で使用）    |
| created_at  | TEXT | NOT NULL     | 作成日時                     |
| updated_at  | TEXT | NOT NULL     | 更新日時                     |

**インデックス**:

- `INDEX(user_id, created_at DESC)`

### 3.2 型定義 (Zod)

```typescript
import { z } from "zod";

export const createMemoSchema = z.object({
  content: z
    .string()
    .min(1, "本文は必須です")
    .max(10000, "10,000文字以内で入力してください"),
});

export type CreateMemoInput = z.infer<typeof createMemoSchema>;
```

### 3.3 UI コンポーネント設計

#### MemoListPage.tsx

- **パス**: `/`
- **レイアウト**: レスポンシブグリッド（PC: 3 列, タブレット: 2 列, SP: 1 列）
- **要素**:
  - `MemoCard` のリスト
  - 右下に FAB (Floating Action Button) で新規作成ボタン (`/memos/new` へリンク)
- **空の状態**: メモがない場合は「メモを作成しましょう」等のメッセージを表示

#### MemoCard.tsx

- **Props**: `{ memo }`
- **表示内容**:
  - 本文の冒頭（3 行程度で省略）
  - 作成日時（相対時間表示: "2 時間前" など）
- **アクション**: カード全体が詳細ページへのリンク

#### MemoFormPage.tsx

- **パス**: `/memos/new`, `/memos/:id/edit`
- **フォーム要素**:
  - 本文入力エリア (`textarea`): 自動リサイズまたは十分な高さを確保
  - 保存ボタン
  - キャンセルボタン（一覧または詳細へ戻る）
- **バリデーション**: クライアントサイドでも文字数チェックを行う

#### MemoDetailPage.tsx

- **パス**: `/memos/:id`
- **表示内容**:
  - 本文（改行を `<br>` または `white-space: pre-wrap` で表示）
  - 作成日時・更新日時
- **アクション**:
  - 編集ボタン (`/memos/:id/edit` へ)
  - 削除ボタン（確認ダイアログを表示後、削除 API をコール）
