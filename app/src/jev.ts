import { bearer, isRecord, postJson } from "./http.ts";
import { JEV_MODEL, RERANK_CRITERIA, RERANK_INSTRUCTIONS } from "./models.ts";

export type ChoiceResult = {
  model: string;
  choice: string;
  probabilities: Record<string, number>;
  confidence: number;
  inputTokens: number | null;
};

export async function chooseOption(
  state: string,
  instructions: string,
  criteria: Record<string, string>,
): Promise<ChoiceResult> {
  const payload = await postJson(
    "https://api.typesafe.ai/v1/systemone",
    {
      model: JEV_MODEL,
      state,
      questions: {
        decision: {
          type: "choice",
          instructions,
          criteria,
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
  const answer = payload.answers.decision;
  if (!isRecord(answer) || typeof answer.choice !== "string") {
    throw new Error("jev choice missing");
  }
  const probabilities: Record<string, number> = {};
  if (isRecord(answer.probabilities)) {
    for (const [key, value] of Object.entries(answer.probabilities)) {
      if (typeof value === "number") {
        probabilities[key] = value;
      }
    }
  }
  const confidence =
    typeof answer.confidence === "number" ? answer.confidence : 0;
  const inputTokens = readUsage(payload.usage);
  return {
    model: payload.model,
    choice: answer.choice,
    probabilities,
    confidence,
    inputTokens,
  };
}

export type ScoreResult = {
  model: string;
  score: number;
  inputTokens: number | null;
  usefulness: Record<string, unknown>;
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
  const inputTokens = readUsage(payload.usage);
  const usefulness: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(answer)) {
    if (key !== "state") {
      usefulness[key] = value;
    }
  }
  return {
    model: payload.model,
    score: answer.score,
    inputTokens,
    usefulness,
  };
}

function readUsage(usage: unknown): number | null {
  if (!isRecord(usage) || typeof usage.input_tokens !== "number") {
    return null;
  }
  return usage.input_tokens;
}
