---
title: "第4章 文章をベクトルにする — Embedding"
---

## Embeddingとは？

**Embedding（埋め込み）とは、文章を意味的な特徴を表す数値の列（ベクトル）に変換する処理です。** 例えば、「データはいつ消えますか？」と「退会後のデータ削除について」は異なる単語を使っていますが、似た意味を持っています。Embeddingモデルを使うと、こうした文章同士の意味的な近さを数値で比較できます。

本書では、OpenRouter経由で`text-embedding-3-small`を使用します。今回の設定では、各文章が1536次元のベクトルに変換されます。

![Embeddingとは](https://static.zenn.studio/user-upload/59b5cb61dae8-20261111.png)

## ① 今回の実験内容

今回は「データはいつ削除される？」という質問と、次の2件のマニュアルの意味的な近さを比較します。

| 文書 | 内容 |
|---|---|
| 退会後のデータ削除 | 退会完了から30日後にデータを削除します |
| 請求日 | 料金は毎月1日に請求します |

「退会後のデータ削除」の方が質問に近いはずですが、Embeddingでも同じ結果になるでしょうか。

## ② 実装コードを確認する

実際に実行する処理は、`app/src/commands.ts`の`runEmbed()`です。

```typescript
export async function runEmbed(): Promise<void> {
  const chunks = await loadChunks();
  const deletion = requireChunk(chunks, "退会後のデータ削除");
  const billingDate = requireChunk(chunks, "請求日");
  const started = Date.now();

  const embedded = await embedTexts([
    deletion.body,
    billingDate.body,
    DELETE_QUERY,
  ]);

  field("requested_model", EMBEDDING_MODEL);
  field("response_model", embedded.model);
  field("dimensions", embedded.vectors[0]?.length ?? 0);
  field("embedding_tokens", embedded.tokens);
  field("embedding_ms", Date.now() - started);

  field("pair", "データはいつ削除される？ / 退会後のデータ削除");
  field(
    "cosine_similarity",
    decimal(cosineSimilarity(embedded.vectors[2], embedded.vectors[0])),
  );

  field("pair", "データはいつ削除される？ / 請求日");
  field(
    "cosine_similarity",
    decimal(cosineSimilarity(embedded.vectors[2], embedded.vectors[1])),
  );
}
```

処理は大きく3つです。

1. マニュアルから比較する2つのチャンクを取得する
2. 質問を加えた3つの文章をEmbeddingモデルでベクトル化する
3. 質問と各マニュアルのコサイン類似度を計算する

この実験では、ChromaやJev、回答生成LLMは使用しません。

## ③ OpenRouterへリクエストする

Embeddingモデルの呼び出しは、`app/src/openrouter.ts`の`embedTexts()`で行います。APIリクエスト部分の抜粋です。

```typescript
const payload = await postJson(
  "https://openrouter.ai/api/v1/embeddings",
  { model: EMBEDDING_MODEL, input },
  bearer("OPENROUTER_API_KEY"),
);
```

実際に送るリクエストボディは次の内容です。

```json
{
  "model": "openai/text-embedding-3-small",
  "input": [
    "退会\n退会後のデータ削除\n退会完了から30日後にデータを削除します。",
    "請求\n請求日\n料金は毎月1日に請求します。",
    "データはいつ削除される？"
  ]
}
```

レスポンスには、それぞれの文章に対応するベクトルが含まれます。実装では、返された`data[].index`を使って入力順に並べ直し、件数と次元数を検証しています。

| ベクトル | 対応する文章 |
|---|---|
| `vectors[0]` | 退会後のデータ削除 |
| `vectors[1]` | 請求日 |
| `vectors[2]` | 質問 |

各ベクトルには1536個の数値が入っています。重要なのは数値を個別に読むことではなく、**同じEmbeddingモデルで変換した文章同士を比較できること**です。

## ④ コサイン類似度を計算する

文章同士の近さは、**コサイン類似度（Cosine Similarity）**で計算します。コサイン類似度は、2つのベクトルの向きがどれだけ近いかを表す指標で、値が大きいほど向きが近いことを意味します。

実装は`app/src/openrouter.ts`の`cosineSimilarity()`です。

```typescript
export function cosineSimilarity(left: number[], right: number[]): number {
  if (left.length !== right.length || left.length === 0) {
    throw new Error("cosine inputs have different lengths");
  }

  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;

  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftNorm += left[index] * left[index];
    rightNorm += right[index] * right[index];
  }

  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}
```

この処理では、ベクトルの内積をそれぞれの長さの積で割っています。質問のベクトルと各マニュアルのベクトルを比較することで、どちらが意味的に近いかを調べます。

## ⑤ 実行して結果を確認する

次のコマンドを実行します。

```bash
docker compose run --rm app embed
```

![Embeddingの実行結果](https://static.zenn.studio/user-upload/6c0f3f7d2621-20261110.png)

保存した実行ログの結果は次のとおりです。

| 比較対象 | コサイン類似度 |
|---|---:|
| 質問 ↔ 退会後のデータ削除 | **0.6082** |
| 質問 ↔ 請求日 | 0.2488 |

「退会後のデータ削除」の方が、質問に近い結果となりました。つまり、質問と文書をベクトル化することで、文章同士の意味的な近さを数値で比較できました。

※ 数値は保存した実行ログの結果です。APIを再実行すると、処理時間などは変わる可能性があります。

## 類似度が高ければ、正しい文書なのか？

ここで重要なのは、**コサイン類似度は、回答が正しい確率ではない**ということです。

例えば、次の2つの規定を考えます。

| 規定 | 内容 |
|---|---|
| プラン変更時の日割り | 月の途中でプランを変更すると日割りになる |
| 退会後の請求 | 月の途中で解約しても日割りにはならない |

どちらも「日割り」に関係するため、意味的に近い文書として検索される可能性があります。しかし、「月途中の解約は日割りになる？」という質問に必要なのは、後者の規定です。

**意味が近いことと、回答の根拠として適切なことは別の問題**です。この違いは、後のReranking RAGで詳しく検証します。

## まとめ

Embeddingは、文章をベクトルに変換し、意味的な近さを計算できるようにする技術です。今回はOpenRouterへ3つの文章を送り、返されたベクトルからコサイン類似度を計算しました。ただし、類似度だけでは回答の正しさは保証できません。

次章では、**生成したベクトルをChromaへ保存し、検索できる状態にします。**
