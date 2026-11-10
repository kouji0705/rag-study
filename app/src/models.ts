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
