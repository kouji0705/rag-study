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

export const HIERARCHY_MIN_SCORE = 2;

export const HIERARCHY_INSTRUCTIONS = "この質問の答えは、渡された範囲にあるか";

export const HIERARCHY_CRITERIA = [
  "この質問の答えには関係しない",
  "話題は近いが、答えの規定はここに無い",
  "答えの一部を裏付ける",
  "この質問への答えを直接判断できる",
] as const;

export const MULTI_QUESTION =
  "SSOが使えるプランを月の途中で退会した場合、当月の請求額とデータ削除までの日数は？";

export const MAX_HOPS = 3;

export const HOP_INSTRUCTIONS = "この質問に答えるために、次に探す情報はどれか";

export const HOP_CRITERIA = {
  plan: "使えるプランや機能の規定が、まだ足りない",
  billing: "料金や請求の規定が、まだ足りない",
  deletion: "データ削除の規定が、まだ足りない",
  done: "質問に必要な規定は、渡された文書に揃っている",
} as const;

export const HOP_REWRITE_INSTRUCTION =
  "不足している項目を探す検索文を1つだけ書いてください。検索文以外は書かないでください。";

export const HOP_FACT_INSTRUCTIONS =
  "この質問に答えるために、次に足りない情報はどれか";

export const HOP_FACT_CRITERIA = {
  plan: "SSOが使えるプランの名前が、まだ文書に無い",
  price: "そのプランの月額が、まだ文書に無い",
  billing: "解約した月が日割りか満額かが、まだ文書に無い",
  deletion: "データ削除までの日数が、まだ文書に無い",
  done: "プラン名、月額、解約月の請求、削除までの日数の4つが文書にある",
} as const;

export const INCOMPLETE_INSTRUCTION =
  "渡された文書だけを根拠に答えてください。文書から確認できない項目は、確認できないと書いて、推測しないでください。";

export const GENERIC_SCORE_INSTRUCTIONS =
  "渡された質問に対して、この文書がどの程度の根拠になるか";

export const GENERIC_SCORE_CRITERIA = [
  "質問と関係がない",
  "話題は近いが、回答の根拠にはならない",
  "回答の一部を裏付ける",
  "質問が求める情報を直接裏付ける",
] as const;

export const HIERARCHY_PARENT_INSTRUCTIONS =
  "この質問に必要な規定が、この見出しの配下にありそうか";

export const HIERARCHY_PARENT_CRITERIA = [
  "この質問には関係しない",
  "話題は近いが、必要な規定は配下になさそう",
  "必要な規定の一部が配下にありそう",
  "必要な規定が配下にありそう",
] as const;

export const Q09_COVERAGE_ITEMS = [
  "プラン",
  "請求額",
  "日割りの有無",
  "削除時期",
] as const;

export const INSUFFICIENT_EVIDENCE_ANSWER =
  "確認に足る文書が残らなかったため、回答を作っていません。";

export const HOP_B_CRITERIA = {
  plan: HOP_CRITERIA.plan,
  billing: HOP_CRITERIA.billing,
  deletion: HOP_CRITERIA.deletion,
  done: "使えるプラン、当月の請求額、解約月が日割りか満額か、データ削除までの日数が、渡された文書に揃っている",
} as const;

export const HOP_C_CRITERIA = {
  plan: HOP_B_CRITERIA.plan,
  billing: HOP_B_CRITERIA.billing,
  deletion: HOP_B_CRITERIA.deletion,
  done: HOP_B_CRITERIA.done,
  price: "そのプランの月額が、まだ文書に無い",
} as const;
