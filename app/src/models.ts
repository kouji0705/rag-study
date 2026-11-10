export const EMBEDDING_MODEL = "openai/text-embedding-3-small";
export const EMBEDDING_DIMENSIONS = 1536;
export const ANSWER_MODEL = "openai/gpt-4.1-mini";
export const JEV_MODEL = "jev-latest";

export const COLLECTION_NAME = "taskflow";

export const DELETE_QUERY = "データはいつ削除される？";
export const DELETE_QUESTION = "退会後、データはいつ削除されますか？";
export const PRORATION_QUESTION =
  "Standardプランを月の途中で解約したら、日割りになりますか？";
export const EXTEND_QUESTION =
  "退会後のデータ保存期間を、有料で90日間に延長できますか？";
export const TERM_QUESTION = "「日割り」とはどういう意味ですか？";
export const PLAN_EXIT_QUESTION =
  "プラン変更後に退会した場合、請求とデータ削除はどうなりますか？";
export const PAYMENT_QUESTION =
  "クレジットカードの決済に失敗したままだと、いつタスクを編集できなくなりますか？";

export const EXCLUDE_MIN_SCORE = 2;

export const TARGET_HEADING = "退会後の請求";

export const ANSWER_INSTRUCTION =
  "渡された文書だけを根拠に答えてください。文書から判断できなければ、「分からない」と答えてください。";

export const RERANK_INSTRUCTIONS =
  "月の途中で解約したとき、この文書だけで料金が日割りになるかを判断できるか";

export const RERANK_CRITERIA = [
  "解約した月の料金には関係しない",
  "料金や請求には触れるが、日割りか満額かは判断できない",
  "日割りや満額には触れるが、解約時のルールとは限らない",
  "解約した月の料金が日割りか満額かを判断できる",
] as const;

export const DELETE_SCORE_INSTRUCTIONS =
  "退会後、データはいつ削除されるか。この文書だけで判断できるか";

export const DELETE_SCORE_CRITERIA = [
  "退会後の削除時期には関係しない",
  "退会やデータには触れるが、いつ削除するかは判断できない",
  "削除時期について、回答の一部を裏付ける",
  "退会後にデータをいつ削除するかを直接判断できる",
] as const;

export const EXTEND_SCORE_INSTRUCTIONS =
  "退会後のデータ保存期間を、有料で90日間に延長できるか。この文書だけで判断できるか";

export const EXTEND_SCORE_CRITERIA = [
  "保存期間の延長には関係しない",
  "退会後のデータには触れるが、延長できるかは判断できない",
  "保存期間について、回答の一部を裏付ける",
  "有料で90日間に延長できるかを直接判断できる",
] as const;

export const STRATEGY_INSTRUCTIONS =
  "この質問に答えるとき、マニュアルをどう検索するか";

export const STRATEGY_CRITERIA = {
  none: "一般的な言葉の説明で足り、サービスの規定を調べなくてよい",
  once: "サービスの規定を、この質問のまま1回検索すればよい",
  multi: "複数の規定にまたがるので、検索を分けた方がよい",
} as const;

export const MORE_SEARCH_INSTRUCTIONS =
  "渡された文書だけで、この質問に答えられるか";

export const MORE_SEARCH_CRITERIA = {
  enough: "必要な規定が渡された文書に入っている",
  more: "必要な規定がまだ足りない",
} as const;

export const GENERAL_INSTRUCTION =
  "一般的な言葉の意味だけを説明してください。TaskFlowの料金、日数、手続きは推測しないでください。サービスの規定が必要なら、分からないと答えてください。";

export const REWRITE_INSTRUCTION =
  "足りない点を補う検索文を1つだけ書いてください。検索文以外は書かないでください。";

export const MAX_ADDITIONAL_SEARCHES = 1;

export const RETRIEVAL_INSTRUCTIONS =
  "渡された文書は、この質問の根拠として足りるか";

export const RETRIEVAL_CRITERIA = {
  Correct: "必要な規定が、渡された文書に入っている",
  Ambiguous: "関連する情報はあるが、根拠として十分か判断しにくい",
  Incorrect: "話題は近いが、答えの規定が入っていない",
} as const;

export const SUPPORT_INSTRUCTIONS =
  "生成した回答は、渡された文書の記載に基づいているか";

export const SUPPORT_CRITERIA = {
  supported: "回答の主張が、渡された文書の記載で裏付けられる",
  not_supported: "回答の主張を、渡された文書から裏付けられない",
  contradicted: "回答の主張が、渡された文書の記載と食い違う",
} as const;

export const REVISE_INSTRUCTION =
  "渡された文書の記載に合うように、回答を1回だけ書き直してください。文書に無いことは書かず、確認できなければ「マニュアルからは確認できません」と書いてください。";

export const UNCONFIRMED_ANSWER = "マニュアルからは確認できません";
