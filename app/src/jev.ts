import { bearer, isRecord, postJson } from "./http.ts";
import { JEV_MODEL, RERANK_CRITERIA, RERANK_INSTRUCTIONS } from "./models.ts";

export type ScoreResult = {
  model: string;
  score: number;
  inputTokens: number;
};

export async function scoreDocument(
  document: string,
  instructions: string = RERANK_INSTRUCTIONS,
  criteria: readonly string[] = RERANK_CRITERIA,
): Promise<ScoreResult> {
  const payload = await postJson(
    "https://api.typesafe.ai/v1/systemone",
    {
      model: JEV_MODEL,
      state: document,
      questions: {
        usefulness: {
          type: "score",
          instructions,
          criteria: [...criteria],
        },
      },
    },
    bearer("JEV_API_KEY"),
  );
  if (
    !isRecord(payload) ||
    typeof payload.model !== "string" ||
    !isRecord(payload.answers)
  ) {
    throw new Error("jev response was incomplete");
  }
  const answer = payload.answers.usefulness;
  if (!isRecord(answer) || typeof answer.score !== "number") {
    throw new Error("jev score missing");
  }
  const usage = payload.usage;
  const inputTokens =
    isRecord(usage) && typeof usage.input_tokens === "number"
      ? usage.input_tokens
      : 0;
  return { model: payload.model, score: answer.score, inputTokens };
}
