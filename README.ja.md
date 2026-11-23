# 市外局番マップ

[English](README.md)

日本の固定電話番号の先頭数桁を入力すると、該当する地域へ地図がズームし、色分けして表示する静的Webアプリです。
MA名と自治体名もテキストで表示します。地図はドラッグ・フリック・ピンチで移動/拡大できます。

- `0` は何も起きない、`09` は09x全域、`097` は大分・別府ほか097x、`0975` は大分のみ、`0977` は別府のみ。
- 市外局番と市内局番の組み合わせが重なる場合は複数の区画が該当します。`0839` は山口・美祢を含み、`08397` は山口のみ、`01548` は釧路・弟子屈を含みます。
- 携帯電話（090/080/070）や0120などは対象外で、次に取るべき操作を示すエラーを表示します。
- 電話番号はURLパスに入ります（例: `/0977`）。
- 画面上のテンキー（0-9・削除・クリア）で入力するため、モバイルで仮想キーボードが出ません。
- サーバ不要の静的コンテンツ。地図は [MapLibre GL JS](https://maplibre.org/) とGeoJSONのみ（タイルなし）。

## 必要環境

- Node.js 22.12以上、[Yarn](https://yarnpkg.com/) 4（`corepack enable`）

## インストールと実行

```sh
yarn install
yarn dev        # 開発サーバ
yarn test       # テスト
yarn build      # 型チェック + 本番ビルド（dist/）
yarn preview    # dist/ をローカルで確認
```

## デプロイ

`dist/` は静的ファイルのみです。URLパスに番号が入るため、存在しないパスに `index.html` を返す設定が必要です。
`yarn build` は `dist/404.html`（`index.html` の複製）も出力するので GitHub Pages ではそのまま動作します。
他のホストでは `/* → /index.html` のリライトを設定してください。

環境変数（`.env`）:

| 変数 | 用途 |
| --- | --- |
| `VITE_SITE_URL` | 末尾スラッシュ付きの公開URL（canonical・OGP・生成する `sitemap.xml` / `robots.txt` に使用） |
| `VITE_BASE` | サブディレクトリ配置時のベースパス（例: `/areacode-map/`） |

## データの更新

実行時データは `public/data/` のJSONです。

- `areas.json`: 市外局番、市内局番、MA名、色、自治体（全国地方公共団体コード）
- `municipalities.topo.json`: 境界（TopoJSON）

`scripts/build-data.mjs` が `data/source/` から生成します。

```sh
# 1. 総務省PDFを取得してテキスト化
curl -o soumu.pdf https://www.soumu.go.jp/main_content/000141817.pdf
pdftotext -layout soumu.pdf data/source/soumu-000141817.txt
# 2. （任意）libphonenumberの地域名を更新
curl -o data/source/libphonenumber-ja-81.txt \
  https://raw.githubusercontent.com/google/libphonenumber/master/resources/geocoding/ja/81.txt
# 3. 再生成
yarn data:build
```

未解決・未割当の自治体はスクリプトが表示します。アイコンとOGP画像は `yarn assets:build`（Font Awesomeの電話アイコン）で生成します。

## データの出典とライセンス

[NOTICE.md](NOTICE.md) を参照してください。アプリのコードはMIT（[LICENSE](LICENSE)）、データや外部素材はそれぞれのライセンス/利用規約に従います。

## 制限事項

- MA名は、libphonenumberの地域名と自治体名から機械的に付けた名称です。
- 市内局番で自治体が分割される場合は自治体全体を着色します（薄い色は一部のみ該当）。境界は概略です。
- 境界データは2021年1月1日時点（国土数値情報N03）で、以降の市町村合併は反映されません。
- 公式情報ではありません。正確な情報は総務省の割当状況をご確認ください。
