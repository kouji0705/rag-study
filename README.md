# はじめに

Zenn 本『RAGを図で理解する — 検索したのに答えられないのはなぜ？』の原稿と、章と同じ手順で動かすハンズオンです。

架空の BtoB SaaS「TaskFlow」のマニュアルを題材にします。似た文書は見つかるのに答えられない、というところから始めて、検索結果の並べ替え、除外、検索のやり直し、階層や関係のたどり方までを、同じ質問で比べます。実装は TypeScript です。Embedding と回答生成は OpenRouter、文書の評価や処理の選択は [Jev](https://typesafe.ai/)、ベクトルの保存と検索は Chroma を使います。

原稿は [`books/cd019af39edb03`](books/cd019af39edb03) にあります。

## 必要なもの

アプリの実行には、次を使います。

| ツール | 用途 |
|---|---|
| Git | リポジトリの取得 |
| Docker Desktop（または Docker Engine と Compose） | アプリと Chroma の起動 |

Node.js をホストへ入れる必要はありません。TypeScript はコンテナ内で実行します。本のプレビューだけをホストで行うときは、Node.js と npm が必要です。

OpenRouter と Jev の API キーが必要です。呼び出しには料金がかかることがあります。

- [OpenRouter の API キー](https://openrouter.ai/settings/keys)
- [TypeSafe（Jev）](https://typesafe.ai/)

## 本をプレビューする

リポジトリのルートで依存関係を入れて、Zenn CLI のプレビューを起動します。

```bash
npm install
npm run preview
```

プレビューはポート `8000` を使います。Chroma はホスト側 `8001` に出しているので、同時に起動してもポートは重なりません。

## アプリを起動する

リポジトリのルートで環境変数ファイルを作り、API キーを書きます。`.env` は Git の対象外です。

```bash
cp .env.example .env
```

```dotenv
OPENROUTER_API_KEY=発行したキー
JEV_API_KEY=発行したキー
CHROMA_HOST=localhost
CHROMA_PORT=8001
```

Chroma を起動し、アプリをビルドして接続を確認します。引数なしの実行は `check` です。キーの値は出さず、設定の有無と Chroma への接続だけを見ます。

```bash
docker compose up -d chroma
docker compose build app
docker compose run --rm app
```

`OPENROUTER_API_KEY: set`、`JEV_API_KEY: set`、`chroma: ok` と出れば起動できています。`set` はキーが空でないことだけを表し、キーが有効かどうかは見ていません。

アプリコンテナから Chroma へは `chroma:8000` で接続します。ホストから見るときは `localhost:8001` です。

停止は次です。`docker compose down -v` は Chroma のボリュームも削除します。

```bash
docker compose down
```

## 章とコマンド

各章の手順は原稿にあります。コマンドの入口は `app/src/main.ts` です。

| 章 | 原稿 | 主なコマンド |
|---|---|---|
| はじめに | `introduction.md` | |
| 第1章 RAGとは何か | `01-what-is-rag.md` | |
| 第2章 環境構築 | `02-setup.md` | `check` |
| 第3章 見出しで分ける | `03-split-by-heading.md` | `split` |
| 第4章 Embedding | `04-embedding.md` | `embed` |
| 第5章 ベクトルDB | `05-vector-db.md` | `index` |
| 第6章 Naive RAG | `06-naive-rag.md` | `answer` |
| 第7章 属性で絞る | `07-metadata-filter.md` | `filter` |
| 第8章 Reranking | `08-rerank.md` | `rerank` |
| 第9章 Filtering | `09-exclude.md` | `exclude` |
| 第10章 Adaptive RAG | `10-route.md` | `route` |
| 第11章 Corrective RAG | `11-retry.md` | `retry` |
| 第12章 回答の検証 | `12-verify.md` | `verify` |
| 第13章 階層探索 | `13-descend.md` | `descend` |
| 第14章 Multi-hop | `14-hop.md` | `hop` |
| 第15章 関係をたどる | `15-relate.md` | `relate` |
| 第16章 検索方法の比較 | `16-compare.md` | `compare` |
| 第17章 使い分け | `17-map.md` | |

実行例です。

```bash
docker compose run --rm app split
docker compose run --rm app answer --question "データはいつ削除される？"
```

このほかに `search`、`verify-fixture`、`verify-index`、`hop-facts`、`eval` があります。評価ケースの置き方は [`eval/README.md`](eval/README.md) に書いてあります。`gold` などの確認項目は採点用で、検索や回答のプロンプトには混ぜません。

比較に使う固定版のマニュアルは `fixtures/manuals/taskflow-v18/` です。手元で直しているマニュアルは `manual/` です。

## ディレクトリ

```text
rag-study/
├── app/                  TypeScript アプリ
├── books/cd019af39edb03/ 本の原稿
├── manual/               TaskFlow のマニュアル
├── fixtures/             比較用の固定資料
├── eval/                 評価ケース
├── compose.yaml
└── .env.example
```

| パス | 役割 |
|---|---|
| `app/src/main.ts` | コマンドの入口 |
| `app/src/commands.ts` | RAG の処理 |
| `app/src/openrouter.ts` | Embedding と回答生成 |
| `app/src/jev.ts` | Jev への評価リクエスト |
| `app/src/chroma.ts` | Chroma との通信 |
| `books/cd019af39edb03/config.yaml` | 本の章順 |
