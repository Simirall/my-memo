# Phase 5: URL 投稿・AI 要約機能

## 1. 概要

メモに URL が含まれている場合、その Web ページの内容を自動的に取得し、Cloudflare Workers AI を利用して要約を生成・保存する機能を実装します。
これにより、ユーザーはリンクを保存するだけで、後から内容を素早く把握できるようになります。

## 2. 実装タスクリスト

### 2.1 インフラ (Cloudflare)

- [ ] `wrangler.jsonc` への Workers AI バインディング設定
- [ ] 使用モデルの決定（`@cf/meta/llama-3-8b-instruct` 等）

### 2.2 バックエンド (Hono)

- [ ] スクレイピング・要約サービスの実装 (`src/features/summary/service.ts`)
  - 指定 URL の HTML 取得 (`fetch`)
  - 本文抽出（不要なタグの除去）
  - Workers AI による要約生成
- [ ] メモ機能の拡張 (`src/features/memo/`)
  - メモ作成・更新処理において、URL が存在する場合にバックグラウンドタスク (`c.executionCtx.waitUntil`) を起動
  - タスク内で要約生成サービスを呼び出し、完了後に `memos` テーブルを更新

### 2.3 フロントエンド (Hono/JSX)

- [ ] メモフォームの拡張 (`MemoFormPage.tsx`)
  - URL 専用入力欄の追加（本文とは別管理とする場合）
  - または本文内の URL 自動検出ロジック（今回はシンプルに専用欄を推奨）
- [ ] メモ詳細の拡張 (`MemoDetailPage.tsx`)
  - AI 要約の表示エリア追加
  - ローディング状態や「要約生成中」の表示（必要であれば）

## 3. 詳細設計

### 3.1 処理フロー（非同期処理）

1. **メモ保存リクエスト**: ユーザーが URL 付きでメモを保存。
2. **DB 保存**: サーバーは `memos` テーブルにレコードを作成。`url_summary` は `NULL` または空文字。
3. **レスポンス**: サーバーは即座に「保存成功」をクライアントに返す。
4. **バックグラウンド処理** (`waitUntil`):
   1. URL へアクセスし HTML を取得。
   2. HTML から `<script>`, `<style>` 等を除去し、テキストコンテンツを抽出。
   3. Cloudflare Workers AI にテキストを送信し、要約をリクエスト。
   4. 生成された要約テキストで `memos` テーブルの当該レコード (`url_summary`) を更新。

### 3.2 AI プロンプト設計

- **モデル**: `@cf/meta/llama-3-8b-instruct` (または `@cf/qwen/qwen1.5-14b-chat-awq` など日本語に強いモデル)
- **システムプロンプト**:
  > あなたは優秀なアシスタントです。渡された Web 記事のテキストを読み、その内容を日本語で、3 点の箇条書きで簡潔に要約してください。
- **ユーザープロンプト**:
  > [記事テキスト...]

### 3.3 UI コンポーネント設計

#### MemoFormPage.tsx (拡張)

- **URL 入力欄**:
  - `<input type="url" class="input input-bordered" placeholder="https://example.com" />`
  - 任意入力。

#### MemoDetailPage.tsx (拡張)

- **要約表示エリア**:
  - `url_summary` カラムに値がある場合のみ表示。
  - daisyUI の `chat-bubble` や `alert` コンポーネントを活用して、AI 生成コンテンツであることを明示する。
  - 例:
    ```tsx
    {
      memo.urlSummary && (
        <div className="alert alert-soft alert-info mt-4">
          <div className="flex flex-col">
            <span className="font-bold text-xs">✨ AI Summary</span>
            <div className="text-sm whitespace-pre-wrap">{memo.urlSummary}</div>
          </div>
        </div>
      );
    }
    ```
