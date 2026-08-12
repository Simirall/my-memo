---
name: guard-d1-bind-parameters
description: Cloudflare D1とDrizzleの動的なバインドパラメータ数を設計、実装、レビュー、テストで上限内に保つ。my-memoで複数行INSERT・UPSERT・UPDATE、配列からのvalues()、inArray、動的IN句、db.batch()、ページサイズや一括処理件数の変更、Drizzleスキーマのdefault追加、D1のtoo many SQL variablesやバインド変数上限エラーを扱うときに使用する。
---

# D1のバインドパラメータ上限を守る

D1へ送る実際の1 SQL文を基準に判断する。アプリコードで明示した値の個数だけから安全性を推測しない。

## 上限を確認する

作業時点のCloudflare D1公式Limitsを確認する。2026年8月時点では、1クエリあたりのバインドパラメータ上限は100個である。`db.batch()`も各SQL文に同じ上限が適用される。

## 危険なクエリを探す

次を変更またはレビューするときは、配列の最大件数と生成パラメータ数を確認する。

- `.values(items.map(...))`による複数行INSERT・UPSERT
- `inArray(column, items)`や動的な`IN`句
- 行数に比例してプレースホルダーが増えるUPDATE・DELETE
- ページサイズ、インポート件数、キャッシュ更新件数、バッチサイズ
- Drizzle列の`.default(...)`や`onConflictDoUpdate(... set ...)`

Drizzleは、省略した列のリテラルデフォルトや競合更新値もパラメータ化することがある。今回の`link_preview_cache`では、UPSERT対象1行につき5個、競合更新部分に2個を生成したため、19行は97個、20行は102個になった。

## 生成SQLで数える

実行前のDrizzleクエリで`.toSQL()`を使い、`params.length`を確認する。スキーマやDrizzle更新で個数は変わり得るため、過去の計算値を固定の真実として扱わない。

```ts
const query = db.insert(table).values(rows).onConflictDoUpdate({...}).toSQL();
expect(query.params.length).toBeLessThanOrEqual(100);
```

本番データを使って確認する必要はない。実スキーマと最大件数を使ったローカル検証を優先する。

## 安全に分割する

最大件数を一度に送らず、十分に余裕のある固定件数へ分割する。このリポジトリでは、特別な理由がなければ10件を既定値とする。

```ts
const BATCH_SIZE = 10;

for (let index = 0; index < items.length; index += BATCH_SIZE) {
  await execute(items.slice(index, index + BATCH_SIZE));
}
```

- 空配列ではSQLを実行しない。
- D1は単一DB内の処理を直列化するため、通常は各チャンクを順番に`await`する。
- `db.batch()`へ移しても、1 SQL文のパラメータ上限は解消しない。
- 全チャンクの原子性が必要なら、単純な逐次分割で済ませず、失敗時の契約とD1で利用可能なトランザクション手段を確認する。
- キャッシュなど部分成功を再実行で回復できる処理は、逐次分割を優先する。

## 境界を統合テストで守る

アプリが実際に許す最大件数を、`@cloudflare/vitest-pool-workers`のD1統合テストで通す。モックの呼び出し回数ではなく、処理結果とDB状態を検証する。

- テスト名は日本語にする。
- 上限由来で分かりにくい境界には、短い理由コメントを残す。
- 20件表示が契約なら20件を投入し、全件が保存・取得されることを確認する。
- チャンク内部の順序が契約でなければ、配列順ではなく集合やDB件数を検証する。
- テストが修正前の実装でD1エラーになり、修正後に成功することを確認する。

## 完了確認

関連するD1統合テストを先に実行し、引き渡し前に次を実行する。

```powershell
pnpm run test:collect
pnpm run test:all
pnpm exec tsc --noEmit
pnpm exec biome check app scripts vitest.config.ts vitest.unit.config.ts vitest.browser.config.ts package.json
pnpm run build
git diff --check
```

クエリの分割だけならDBスキーマは変わらないため、マイグレーションを追加しない。
