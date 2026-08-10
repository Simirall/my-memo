# RouteベースのVertical Slice

`app/routes`をHTTPと画面の境界とします。HonoXのrouteファイルはこのツリーに配置し、routeとして扱わないファイルやディレクトリには先頭に`-`を付けます。

このファイル名が`-README.md`なのは、HonoXが`app/routes`配下のMarkdownもrouteとして探索するためです。

## 所有範囲

- 単一routeだけが利用するコンポーネント、Island、入力処理、テストは、そのrouteへco-locationします。
- 2つ以上のrouteが実際に利用する業務コードだけを`app/features`へ配置します。将来の再利用予測だけではfeatureへ移しません。
- 共通UIと共通Islandは、それぞれ`app/components`と`app/islands`へ配置します。
- featureが大きくなった場合は、技術レイヤーより先に業務上の小ドメインで分割します。小ドメイン内で必要な場合だけ`client`や`server`などの技術レイヤーを設けます。
- テストは対象実装と同じ小ドメインに隣接させ、テスト専用ディレクトリへ集約しません。

## import規約

- バレルファイルは作成せず、利用する実装ファイルから直接importします。
- feature内部のファイル同士は相対importまたは`@/*` aliasを使用できます。責務が離れた参照は、移動に強い`@/*` aliasを優先します。
- `app/features`から`app/routes`を参照してはいけません。
- route同士で内部実装を直接参照しません。共有が発生した実装は`app/features`へ昇格します。
- route横断の統合テストは、対象route群を包含する最も近いrouteドメインに置けます。

## IslandとHonoXの除外規則

route内にIslandをco-locationする場合は、ファイル名を`$*.tsx`にします。`app/islands`の共通Islandも同じ命名規則を使用します。

HonoXでは、次のファイル・ディレクトリはrouteとして扱われません。

- `-`で始まるファイル
- `-`で始まるディレクトリと、その配下のファイル
- `$*.tsx`ファイル
- `*.test.ts`、`*.test.tsx`、`*.spec.ts`、`*.spec.tsx`

`$*.tsx`はroute探索から除外されますが、HonoXによってIslandとして変換され、SSRとclient hydrationの対象になります。
