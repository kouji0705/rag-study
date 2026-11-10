---
title: "第5章 ベクトルDBに登録する"
---

文章をベクトルにできたら、次は保存です。

**「近いベクトル」を探したあとに、その元の文章を取り出せるようにします。**

## ベクトルと本文を、セットで保存する

本書では、保存先にベクトルDBの **Chroma** を使います。1件には、ベクトル、本文、文書ID、見出し、カテゴリを入れます。このセットを集めた入れ物が、**コレクション** です。名前は `taskflow` の一つです。

登録は、見出しで分けた15件をまとめて行います。

```bash
docker compose run --rm app index
```

![登録と検索の実行ログ](https://static.zenn.studio/user-upload/531ec6403593-20261110.png)

最初の実行では、次のようになりました。

```text
collection: taskflow
space: cosine
count: 15
expected_count: 15
readback: match
query: データはいつ削除される？
rank: 1
heading: 退会後のデータ削除
distance: 0.3917
top_cosine_similarity: 0.6083
top_distance_plus_similarity: 1.0000
```

件数は、分けた15件と一致しました。`readback: match` は、保存した削除の規定をIDで読み戻し、本文が同じだったという意味です。質問「データはいつ削除される？」の1位は「退会後のデータ削除」でした。

この実行では、Chroma の distance と、同じベクトルから計算したコサイン類似度を足すと 1.0000 でした。距離が小さいほど近くなります。コサイン類似度そのものとは読まない、という確認です。

Embedding のモデルは、登録も質問も `openai/text-embedding-3-small` です。応答のモデル名は `text-embedding-3-small`、次元数は 1536 でした。15件のベクトル化は 633 トークン、1421 ミリ秒です。質問のベクトル化は別に 12 トークン、701 ミリ秒です。

## 同じ文書を、二重に増やさない

同じ文書IDで登録し直すと、更新になります。同じコマンドをもう一度実行しても、件数は 15 のままでした。

Chroma のデータはボリュームに残します。`docker compose down` のあと `docker compose up -d chroma` し、次で読み直しました。

```bash
docker compose run --rm app search --question "データはいつ削除される？"
```

件数は 15 のまま、1位は再び「退会後のデータ削除」でした。回答は、まだ生成していません。

:::details 実装上の補足・参考記事
距離の種類は、コレクション作成時の `hnsw.space` が `cosine` であることをログの `space` で確認しています。

- [Chromaを学びたい](https://qiita.com/koji0705/items/d4b35609c182b44f6ab1)
- [図鑑情報をChromaに登録し検索する](https://qiita.com/koji0705/items/488f0a7fd7656b493bb4)
  :::
