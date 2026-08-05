# RouteベースのVertical Slice

`app/routes`をアプリケーションの境界とします。HonoXのrouteファイルは
このツリーに配置し、routeとして扱わないファイルやディレクトリには、先頭に
`-`を付けます。

このファイル名が`-README.md`なのは、HonoXが`app/routes`配下のMarkdownも
routeとして探索するためです。

## 所有範囲

- 各routeは、自身の`index.tsx`、route専用コンポーネント、route専用Islandを所有します。
- 複数routeで利用するドメインコードは、次のfeatureへ配置します。
  - `-features/memos`
  - `-features/categories`
  - `-features/tags`
  - `-features/sharing`
- 複数featureにまたがるUI、ブラウザ処理、認証clientは`-shared`に配置します。
- `app/schema.ts`、`app/auth.ts`、`app/utils/authorization.ts`、
  `app/utils/quota.ts`は、永続化・認証認可の基盤として維持します。

## import規約

各featureは`index.ts`を公開入口とします。routeや他featureからは、feature内部の
ファイルを直接参照せず、`index.ts`経由でimportします。

feature内部のファイル同士は相対importを使用します。sliceをまたぐ参照には、
`app/*`を指す`@/*` aliasを使用します。

## IslandとHonoXの除外規則

route内にIslandをコロケーションする場合は、ファイル名を`$*.tsx`にします。
例：`$create-memo-form.tsx`、`$user-access-form.tsx`。

HonoXでは、次のファイル・ディレクトリはrouteとして扱われません。

- `-`で始まるファイル
- `-`で始まるディレクトリと、その配下のファイル
- `$*.tsx`ファイル
- `*.test.ts`、`*.test.tsx`、`*.spec.ts`、`*.spec.tsx`

`$*.tsx`はroute探索から除外されますが、HonoXによってIslandとして変換され、
SSRとclient hydrationの対象になります。
