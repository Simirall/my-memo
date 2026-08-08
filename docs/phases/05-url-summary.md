# Phase 5: URL 投稿・AI 要約機能

## 1. 概要

メモに URL が含まれている場合、その Web ページの内容を自動的に取得し、Cloudflare Workers AI を利用して要約を生成・保存する機能を実装します。
これにより、ユーザーはリンクを保存するだけで、後から内容を素早く把握できるようになります。

## 2. 実装タスクリスト

### 2.1 インフラ (Cloudflare)

- [ ] `wrangler.jsonc` への Workers AI バインディング設定
- [ ] 使用モデルの決定（`@cf/google/gemma-4-26b-a4b-it`）

### 2.2 バックエンド (HonoX)

- [ ] スクレイピング・要約サービスの実装 (`app/features/summary/service.ts`)
  - 指定 URL の HTML 取得 (`fetch`)
  - 本文抽出（不要なタグの除去）
  - Workers AI による要約生成
- [ ] メモ機能の拡張 (`app/features/memo/`)
  - URL 投稿専用のエンドポイント (`POST /memos/url`) を実装。リクエストで `url` とオプションの `category_id`（カテゴリ UUID）を受け付け、`category_id` が指定された場合は当該ユーザーのカテゴリであることを検証してから処理を進める。
  - 要約生成サービスを呼び出し、結果を `memos` テーブルに新規保存 (`is_ai_summary: 1`)。`category_id` が妥当な場合は `memos.category_id` に保存する。

### 2.3 フロントエンド (HonoX)

- [ ] URL 投稿専用画面の実装 (`app/routes/memos/url.tsx`)
  - URL 入力欄
  - カテゴリ選択 UI
- [ ] メモ詳細の拡張 (`app/routes/memos/[id].tsx`)
  - AI 要約の表示エリア追加
  - ローディング状態や「要約生成中」の表示（必要であれば）

## 3. 詳細設計

### 3.1 処理フロー（同期処理）

1. **URL 投稿リクエスト**: ユーザーが URL 投稿専用画面から URL を送信。
2. **スクレイピング & AI 要約**:
   1. サーバー側で URL へアクセスし HTML を取得。
   2. HTML から `<script>`, `<style>` 等を除去し、テキストコンテンツを抽出。
   3. Cloudflare Workers AI にテキストを送信し、タイトルと要約を生成。
3. **DB 保存**:
   - `title`: AI 生成タイトル
   - `content`: AI 生成要約
   - `url`: 入力 URL
   - `is_ai_summary`: 1
   として `memos` テーブルに保存。
4. **レスポンス**: 保存完了後、メモ詳細画面または一覧画面へリダイレクト。

### 3.2 AI プロンプト設計

- **モデル**: `@cf/google/gemma-4-26b-a4b-it`
- **システムプロンプト**:
  > あなたは優秀なアシスタントです。渡された Web 記事のテキストを読み、その内容を日本語で、3 点の箇条書きで簡潔に要約してください。
- **ユーザープロンプト**:
  > [記事テキスト...]

### 3.3 UI コンポーネント設計

#### UrlMemoPage.tsx (新規)

- **パス**: `/memos/url`
- **フォーム要素**:
  - **URL 入力欄**:
    - `<input type="url" class="input input-bordered" placeholder="https://example.com" required />`
  - **カテゴリ選択（任意）**:
    - `<select class="select select-bordered" name="category_id">
        <option value="">未分類</option>
        <!-- サーバーから取得したユーザーのカテゴリ一覧を表示 -->
      </select>`
    - クライアントは `/categories` 等からカテゴリ一覧を取得して選択肢を表示する。
  - **送信ボタン**: 「要約して保存」

#### MemoDetailPage.tsx (拡張)

- **要約表示エリア**:
  - `isAiSummary` が `1` の場合、AI Summaryメモであることを明示する。
  - 可能ならカテゴリ名も表示してユーザーがどのカテゴリに保存されたかを明示する（`memo.category_id` → カテゴリ名を表示）。
  - daisyUI の `chat-bubble` や `alert` コンポーネントを活用する。
  - 例:
    ```tsx
    {
      memo.isAiSummary === 1 && (
        <div className="alert alert-soft alert-info mt-4">
          <div className="flex flex-col">
            <span className="font-bold text-xs">✨ AI Summary</span>
            <div className="text-sm whitespace-pre-wrap">{memo.content}</div>
            {/* カテゴリ名表示 */}
            <div className="text-xs text-muted">Category: {memo.categoryName ?? '未分類'}</div>
          </div>
        </div>
      );
    }
    ```
