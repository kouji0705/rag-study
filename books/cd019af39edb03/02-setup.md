---
title: "第2章 環境構築"
---

リポジトリのルートで次を実行すると、アプリはキーの有無と、Chromaへの接続だけを表示します。

```bash
docker compose up -d chroma
docker compose --progress plain run --rm app
```

![起動確認の実行結果](https://static.zenn.studio/user-upload/1e1c07c03aca-20261110.png)

`set` は、その名前のキーが `.env` に入っているという意味です。値は表示しません。`chroma: ok` は、アプリのコンテナから Chroma の heartbeat へ届いたという意味です。ログの `chroma:8000` は、Composeのネットワークの中の宛先です。手元のマシンから Chroma を見るポートは `8001` です。

**この章で確かめるのは、起動と接続までです。** 文書の登録と回答は、まだ行いません。

仕組みだけを読む場合は、ここのコマンドは飛ばせます。

## 使う道具

| 道具           | 役割                                   |
| -------------- | -------------------------------------- |
| TypeScript     | RAGの処理を書く                        |
| Docker Compose | アプリとDBを起動する                   |
| Chroma         | 文書とベクトルを保存・検索する         |
| OpenRouter     | 文章のベクトル化と回答生成を呼び出す   |
| Jev            | 文書の役立ちを評価する。並べ替えで使う |

アプリのコンテナは Node.js 26 で動きます。

## APIキーは `.env` に置く

APIを使う場合は、OpenRouterとJevでキーを発行します。利用には料金がかかります。

リポジトリのルートで、設定用ファイルをコピーします。

```bash
cp .env.example .env
```

`.env` に次の値を設定します。

```dotenv
OPENROUTER_API_KEY=発行したキー
JEV_API_KEY=発行したキー
CHROMA_HOST=localhost
CHROMA_PORT=8001
```

**キーを書いた `.env` はGitへ登録しません。** `.env.example` には変数名だけを残します。Composeでアプリを起動すると、接続先はコンテナ内の `chroma:8000` に置き換わります。

## つながらないとき

Chromaが止まっていると、アプリは約30秒待ったあと `chroma: failed` と出して終了します。そのときは `docker compose up -d chroma` を先に実行します。
