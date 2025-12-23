# Phase 4: 画像投稿機能

## 1. 概要

メモに画像を添付する機能を実装します。
画像データは Cloudflare R2 (オブジェクトストレージ) に保存し、データベースでメタデータを管理します。
1 つのメモに対して複数の画像を添付できるようにします。

## 2. 実装タスクリスト

### 2.1 インフラ (Cloudflare R2)

- [ ] `wrangler.jsonc` への R2 バケット設定追加
- [ ] ローカル開発環境での R2 バインディング確認

### 2.2 データベース (D1)

- [ ] `images` テーブルのマイグレーション作成 (`db/migrations/0005_create_images.sql`)
- [ ] ローカル D1 へのマイグレーション適用

### 2.3 バックエンド (HonoX)

- [ ] 画像機能の実装 (`app/features/image/`)
  - Routes: 画像アップロード API (`app/routes/api/upload.ts`)
    - ファイルを受け取り R2 に保存
    - `images` テーブルにレコード作成
  - Routes: 画像削除 API (`app/routes/api/images/[id]/delete.ts`)
    - R2 からファイルを削除
    - `images` テーブルからレコード削除
  - Repository: 画像データの保存・削除処理
- [ ] メモ機能の拡張 (`app/features/memo/`)
  - Repository: メモ作成・更新時に、画像レコードの `memo_id` を更新して紐付ける処理
  - Repository: メモ取得時に画像リストを含める処理

### 2.4 フロントエンド (HonoX/Island)

- [ ] 画像アップロードコンポーネント (`app/islands/ImageUploader.tsx`)
  - ファイル選択 UI
  - 非同期アップロード処理
  - プレビュー表示
- [ ] メモフォームの拡張 (`app/routes/memos/new.tsx`, `app/routes/memos/[id]/edit.tsx`)
  - `ImageUploader` の組み込み
  - アップロード済み画像 ID の管理
  - 既存画像の削除ボタン追加（編集画面）
- [ ] メモ詳細の拡張 (`app/routes/memos/[id].tsx`)
  - 画像ギャラリー表示

## 3. 詳細設計

### 3.1 データベーススキーマ

#### images テーブル

| カラム     | 型   | 制約         | 説明                                                       |
| ---------- | ---- | ------------ | ---------------------------------------------------------- |
| id         | TEXT | PRIMARY KEY  | UUID v4                                                    |
| user_id    | TEXT | NOT NULL, FK | 所有ユーザー                                               |
| memo_id    | TEXT | FK           | 紐付くメモ ID（アップロード直後は NULL、メモ保存時に更新） |
| file_path  | TEXT | NOT NULL     | R2 内のパス (key)                                          |
| public_url | TEXT | NOT NULL     | 表示用 URL                                                 |
| created_at | TEXT | NOT NULL     |                                                            |

### 3.2 API 設計

#### POST /api/upload

- **Content-Type**: `multipart/form-data`
- **パラメータ**: `file` (画像ファイル)
- **処理フロー**:
  1. ファイル形式・サイズチェック（5MB 以下、jpeg/png/gif/webp）
  2. R2 バケットへファイルを PUT（キーは UUID 等でランダム生成）
  3. `images` テーブルに `memo_id=NULL` でレコード作成
  4. 画像の ID と URL をレスポンスとして返す
- **レスポンス**:
  ```json
  {
    "id": "uuid...",
    "url": "https://..."
  }
  ```

#### POST /api/images/:id/delete

- **メソッド**: POST (または DELETE)
- **処理フロー**:
  1. 指定された画像 ID がログインユーザーのものであるか確認
  2. R2 からオブジェクトを削除
  3. `images` テーブルからレコードを削除
- **レスポンス**: 200 OK

### 3.3 UI コンポーネント設計

#### ImageUploader.tsx

- **機能**:
  - ドラッグ＆ドロップまたはクリックでファイル選択
  - 選択されたファイルを即座に `/api/upload` へ送信
  - アップロード中はローディング表示
  - 完了後、プレビュー画像を表示
- **連携**:
  - 親コンポーネント（フォーム）に、アップロードされた画像の ID リストを渡すコールバックを持つ。

#### MemoFormPage.tsx (拡張)

- **状態管理**:
  - `uploadedImageIds`: 新規アップロードされた画像の ID 配列
  - `existingImages`: 編集時に既存の画像リスト
- **送信処理**:
  - メモ作成 API へのリクエストボディに `imageIds: string[]` を含める。
- **画像削除（編集時）**:
  - 既存画像の横に「削除」ボタンを表示。
  - クリック時に `/api/images/:id/delete` を呼び出し、成功したら画面から削除。

#### MemoDetailPage.tsx (拡張)

- **表示**:
  - 本文の下に画像一覧を表示。
  - クリックで拡大表示（モーダル等）ができれば尚良い（daisyUI の Modal を利用）。
