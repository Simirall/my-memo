# 運用とデータ変更

## Cloudflareと認証の設定

D1、R2、Workers AI、定期実行の設定は`wrangler.jsonc`を正とします。
環境ごとの認証情報はリポジトリへ保存せず、次のSecretとして設定します。

- `BETTER_AUTH_URL`
- `BETTER_AUTH_SECRET`
- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`

GitHub OAuth AppのAuthorization callback URLは、`BETTER_AUTH_URL`に`/api/auth/callback/github`を加えたURLです。

## GitHubの必須チェック

`.github/workflows/verify.yml`の`verify`ジョブは、すべてのPull Requestと`main`へのpushで実行します。
GitHubで一度このworkflowを実行した後、Settings → Rules → Rulesetsで`main`のルールを開き、Require status checks to passを有効にして`verify`を追加します。
Dependabotの自動マージを設定する場合も、この`verify`を必須条件にします。

## GitHub Actionsからの本番デプロイ

`.github/workflows/deploy.yml`は`main`へのpushで`verify`が成功した場合だけ`workflow_run`で実行します。
GitHubの`production` Environmentを作成し、Deployment branchesを`main`に限定して次のEnvironment Secretを登録します。

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`

API Tokenは対象Accountと`partial.cc` Zoneに限定し、`Workers Scripts Edit`、`D1 Edit`、`Workers Routes Edit`だけを付与します。
`BETTER_AUTH_URL`、`BETTER_AUTH_SECRET`、`GITHUB_CLIENT_ID`、`GITHUB_CLIENT_SECRET`はWorker SecretとしてCloudflareに残します。
通常のWorker変数も維持するため、デプロイでは`wrangler deploy --keep-vars`を使用します。

デプロイはD1 migration、Worker、`https://my-memo.partial.cc/login`の疎通確認の順です。
疎通確認に失敗した場合は自動でrollbackせず、適用済みmigrationとの互換性を確認してCloudflareのdeployment履歴から手動で戻します。

Actionsからの初回デプロイを確認したら、Cloudflare DashboardのWorker → Settings → BuildsでGit RepositoryをDisconnectします。
Workers Buildsにだけ設定されていたbuild environment variableがないことを確認してから解除します。

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
