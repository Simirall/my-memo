# ページとHTTPルートの配置

`app/pages`はWakuのページとレイアウトの入口です。
全ページを`dynamic`にし、個人データをビルド時に取得しません。
`app/waku.server.tsx`のglobはテストを除外します。

`app/routes/api`には既存のHono APIを置き、`app/server.ts`で明示的に接続します。
`POST /share`もHonoで本文サイズを制限して受け付け、WakuのServer Action処理には渡しません。

## コンポーネントとデータ取得

ページはServer Componentとし、認証済みコンテキストを`app/server/request-context.ts`から取得します。
Bindingsと認証情報はClient Componentへ渡しません。
一覧とMarkdownはサーバーで描画し、描画結果をClient Componentのpropsに渡します。
操作やhooksを使うファイルには`'use client'`を指定します。
既存の`$*.tsx`と`app/islands`は配置を維持していますが、自動変換の規則はありません。

単一画面だけが利用するコンポーネントと入力処理は、その画面に対応する`app/routes`配下へ置きます。
複数画面が利用する業務コードは`app/features`、共通UIは`app/components`を使います。
featureからrouteを参照せず、バレルファイルは作成しません。

## 遷移と更新

内部リンクは`AppLink`、フォームからの遷移は`useAppRouter`を使います。
OAuth、ログアウト、ファイル取得、外部リンクはHTTPで処理します。
更新は既存APIを呼び、一覧へ反映するときはRouterの`reload()`で再取得します。
Reactが所有するカードや選択肢をDOM操作で移動、削除、追加しません。
保存成功と画面再取得の失敗を区別し、成功したAPIを自動再送しません。

## テスト

テストは対象実装の近くに配置します。
ブラウザ単体テストはReactのrootをテストごとに破棄し、Routerをmockしてアプリの入力とAPI契約を検証します。
SSR、RSC、CSP、所有者分離、画面をまたぐ操作は、ビルド済みWorkerを使うE2Eで検証します。
