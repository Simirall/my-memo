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

## Dependabotの更新と自動マージ

### 更新の確認と待機期間

`.github/dependabot.yml`はnpmとGitHub Actionsの更新を毎日06:00（JST）に確認します。
通常の更新は公開後3日待ってPRを作成します。
セキュリティ更新には、この待機期間を適用しません。[^dependabot-cooldown]

`pnpm-workspace.yaml`の`minimumReleaseAge: 4320`は直接依存と間接依存を含めて公開後3日未満のインストールを拒否します。
Dependabotの待機期間では防げないセキュリティ更新や間接依存による`ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION`は、`.github/workflows/dependabot-retry.yml`が6時間ごとに調べ、最後の失敗から24時間以上経過したものだけを再実行します。
その他の失敗は再実行しません。

### 検証とマージ

`.github/workflows/dependabot-auto-merge.yml`は、Dependabot PRの`Verify`が成功したときに自動マージを試みます。
対象はmain向けの非draft PRで、同じリポジトリ内のブランチに限ります。
検証したコミットのSHAと現在のPRのhead SHAが一致することを確認してから、squash mergeします。
必須チェックと署名要件はGitHubのRulesetで維持します。

PRがmainに追従していない場合は、`@dependabot rebase`を投稿して更新を依頼します。[^dependabot-commands]
この実行ではマージせず、Dependabotによる更新後のPR検証へ引き継ぎます。
マージ直前にmainが進んだ場合も、同じ更新依頼へ戻ります。

競合がある場合は、`@dependabot recreate`を投稿して再作成を依頼します。[^dependabot-commands]
各依頼は、同じhead SHAとbase SHAの組み合わせにつき一度だけ投稿します。
再作成はPRへの編集を上書きするため、Dependabot PRには手動変更を加えない運用とします。
依頼後に更新されない場合は、PR上のDependabotの応答と更新ログを確認します。

PRブランチの検証には、通常の`pull_request`イベントを使用します。
`workflow_dispatch`で起動したジョブのチェックは、成功してもPRの必須ステータスチェックを満たしません。[^required-checks]
また、`GITHUB_TOKEN`でPRを更新すると、発生するPR検証に承認が必要になるため、update-branch APIでmainを取り込む処理は使用しません。[^workflow-triggers]

### 手動復旧と停止

未マージのPRを復旧するには、Actionsの`Merge verified Dependabot updates`をmainから実行し、`pr_number`に対象のPR番号を指定します。
mainに追従していない場合や競合がある場合は、前述の更新依頼を行います。

mainに追従済みの場合は、現在のhead SHAに対応する最新のPR検証を再実行し、新しい実行回数（`run_attempt`）の成功を待ちます。[^workflow-rerun]
すでに実行中の場合は、二重起動せず完了を待ちます。
対象のPR検証が存在しない場合、検証が失敗した場合、またはPRのhead SHAが変わった場合は、マージせず停止します。
待機上限は50分です。
公開後の待機期間による失敗も、定期再試行からこの復旧処理を呼び出します。

マージ後はmainの`Verify`を明示起動し、検証成功後にDeployが本番へ反映します。
この起動ではAPIバージョン`2026-03-10`を指定し、返されたrun IDを確認します。
このAPIバージョンでは常にrun情報が返るため、`return_run_details`の指定は不要です。[^dispatch-api]
マージ後のmain検証の起動だけが失敗した場合は、マージ済みのPR番号で復旧処理を実行すると、main検証だけを起動します。

自動マージを止めるには、Actions画面で`dependabot-auto-merge.yml`を無効化します。
公開後の待機期間による失敗の再試行は、`dependabot-retry.yml`を手動実行できます。
失敗通知はGitHub Actions標準の通知設定を使用します。

設定値と復旧手順は、このリポジトリのワークフローと`scripts/merge-dependabot.mjs`を根拠としています。

[^dependabot-cooldown]: GitHub Docs, [Dependabot options reference: cooldown](https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference#cooldown)。待機期間はバージョン更新に適用され、セキュリティ更新には適用されません。
[^dependabot-commands]: GitHub Docs, [Dependabot pull request comment commands](https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-pull-request-comment-commands)。`rebase`はリベースを依頼し、`recreate`は追加された編集を上書きしてPRを再作成します。
[^required-checks]: GitHub Docs, [Troubleshooting required status checks: Checks from some workflow jobs are not evaluated](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks#checks-from-some-workflow-jobs-are-not-evaluated)。`workflow_dispatch`によるジョブのチェックは、PRの必須チェックとして評価されません。
[^workflow-triggers]: GitHub Docs, [Triggering a workflow: Triggering a workflow from a workflow](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow#triggering-a-workflow-from-a-workflow)。`GITHUB_TOKEN`でPRを作成または更新した場合、`opened`、`synchronize`、`reopened`によるワークフロー実行は承認待ちになります。
[^workflow-rerun]: GitHub Docs, [REST API endpoints for workflow runs: Re-run a workflow](https://docs.github.com/en/rest/actions/workflow-runs?apiVersion=2026-03-10#re-run-a-workflow)。既存のrun IDを指定してワークフローを再実行します。
[^dispatch-api]: GitHub Docs, [Breaking changes: Version 2026-03-10](https://docs.github.com/en/rest/about-the-rest-api/breaking-changes#version-2026-03-10)。workflow dispatchの応答はrun情報を含むHTTP 200に変更され、`return_run_details`は削除されています。

## GitHub Actionsからの本番デプロイ

`.github/workflows/deploy.yml`は再利用可能なworkflowです。Verify内の`deploy`ジョブが`needs: verify`で検証成功を待ち、mainへのpushまたはmainの明示起動の場合だけ呼び出します。PRとPRブランチの明示起動ではDeployを呼び出しません。GITHUB_TOKENによる明示起動後の`workflow_run`通知には依存しません。
GitHubの`production` Environmentを作成し、Deployment branchesを`main`に限定します。次のSecretはリポジトリのActions secretsへ登録し、VerifyからDeployへ明示的に渡します。`production`のEnvironment secretsに登録した場合は、Deployジョブでそちらが優先されます。

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
