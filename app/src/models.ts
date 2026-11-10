export const EMBEDDING_MODEL = "openai/text-embedding-3-small";
export const EMBEDDING_DIMENSIONS = 1536;
export const ANSWER_MODEL = "openai/gpt-4.1-mini";
export const JEV_MODEL = "jev-latest";

export const COLLECTION_NAME = "taskflow";

export const DELETE_QUERY = "データはいつ削除される？";
export const DELETE_QUESTION = "退会後、データはいつ削除されますか？";
export const PRORATION_QUESTION =
  "Standardプランを月の途中で解約したら、日割りになりますか？";

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
