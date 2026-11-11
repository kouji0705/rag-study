# 評価ケース

`cases.json` は、検索や回答のモデルへ渡す質問と、評価側だけが持つ確認項目を分けて置く。`gold`、`forbiddenClaims`、`evidenceGroups` は採点用であり、検索文の生成、採点、回答生成のプロンプトへ混ぜない。

`answerability` は `manual`、`unanswerable`、`general` の3つ。`unanswerable` と `general` の検索再現率は `not_applicable` とし、0や1にしない。

`evidenceGroups` の外側はすべて必要で、内側は代替候補である。Q08なら、SSOの規定とProの月額の両方が必要になる。

`split` が `tune` のQ01、Q03、Q10、Q11は閾値や基準を調整するときに見る。残りは先に固定した確認用である。同じ資料の小さな回帰セットなので、未知の分野への一般化を示すものではない。

資料hashは、ソートした相対パスと、改行をLFへ揃えた本文を、パス、NUL、本文、NULの順に連結してSHA-256する。索引fingerprintは、資料hash、分割版 `heading-v1`、指定Embeddingモデルの末尾名、次元数、距離尺度を改行で連結してSHA-256する。`openai/text-embedding-3-small` と `text-embedding-3-small` は、末尾のモデル名が同じなら同じ指定として扱う。

実行ログは `artifacts/runs/<run-id>/` に置く。`usage` が取れない値は `null` のままで、0トークンとは扱わない。
