# 運用とデータ変更

## Cloudflareと認証の設定

D1、R2、Workers AI、定期実行の設定は`wrangler.jsonc`を正とします。
環境ごとの認証情報はリポジトリへ保存せず、次のSecretとして設定します。

- `BETTER_AUTH_URL`
- `BETTER_AUTH_SECRET`
- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`

GitHub OAuth AppのAuthorization callback URLは、`BETTER_AUTH_URL`に`/api/auth/callback/github`を加えたURLです。

## データモデルの変更

スキーマの定義元は`app/schema.ts`、D1へ適用する履歴は`migrations/`です。
スキーマを変えたら次の順に進めます。

```powershell
pnpm exec drizzle-kit generate
pnpm run db:local:migrate
pnpm run test:integration
```

生成されたSQLは適用前に確認します。
SQLiteのテーブル再作成が含まれる場合は、対象テーブルを参照するトリガーの退避と復元も確認します。

## プランと権限の不変条件

新規ユーザーには、有効な既定プランをDBから割り当てます。
既定プランまたは必須の上限項目がなければ、ユーザー作成を失敗させます。

上限値の`NULL`は無制限、上限項目自体の欠落は利用不可を表します。
下位プランへ変更しても既存データは削除せず、使用量が上限を下回るまで新規作成を止めます。
最後の管理者はDBの制約で降格できません。

## 添付ファイルの整合性

メモまたは添付の削除ではD1のレコードを先に削除し、R2オブジェクトの削除をジョブとして記録します。
R2削除に失敗してもユーザーの削除操作は取り消さず、定期実行で再試行します。

`wrangler.jsonc`の定期実行は、期限切れアップロードの清掃とR2削除ジョブの処理に使います。
定期実行を外すと不要なR2オブジェクトが残るため、デプロイ後も設定を維持します。
`r2_deletion_job_failed`と`expired_attachment_cleanup_failed`のログを監視し、`r2_deletion_jobs.status = 'failed'`の行がないか必要に応じて確認します。

## デプロイ

D1の変更を先に適用し、その後でWorkerをデプロイします。

```powershell
pnpm run test:all
pnpm run build
pnpm run db:remote:migrate
pnpm exec wrangler deploy
```
