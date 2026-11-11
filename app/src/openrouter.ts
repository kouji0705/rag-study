import { bearer, isRecord, postJson } from "./http.ts";
import {
  ANSWER_INSTRUCTION,
  ANSWER_MODEL,
  EMBEDDING_DIMENSIONS,
  EMBEDDING_MODEL,
} from "./models.ts";

export type EmbeddingResult = {
  model: string;
  vectors: number[][];
  tokens: number | null;
};

export type AnswerResult = {
  model: string;
  text: string;
  inputTokens: number | null;
  outputTokens: number | null;
};

export async function embedTexts(input: string[]): Promise<EmbeddingResult> {
  const payload = await postJson(
    "https://openrouter.ai/api/v1/embeddings",
    { model: EMBEDDING_MODEL, input },
    bearer("OPENROUTER_API_KEY"),
  );
  if (
    !isRecord(payload) ||
    !Array.isArray(payload.data) ||
    typeof payload.model !== "string"
  ) {
    throw new Error("embedding response was incomplete");
  }
  const ordered = payload.data
    .map((item) => {
      if (
        !isRecord(item) ||
        !Array.isArray(item.embedding) ||
        typeof item.index !== "number"
      ) {
        throw new Error("embedding item was incomplete");
      }
      const vector = item.embedding.map((value) => {
        if (typeof value !== "number") {
          throw new Error("embedding value was not a number");
        }
        return value;
      });
      return { index: item.index, vector };
    })
    .sort((left, right) => left.index - right.index);
  if (ordered.length !== input.length) {
    throw new Error("embedding count did not match the input");
  }
  const dimensions = ordered[0]?.vector.length ?? 0;
  if (
    dimensions !== EMBEDDING_DIMENSIONS ||
    ordered.some((item) => item.vector.length !== dimensions)
  ) {
    throw new Error(
      `expected ${EMBEDDING_DIMENSIONS} dimensions, got ${dimensions}`,
    );
  }
  return {
    model: payload.model,
    vectors: ordered.map((item) => item.vector),
    tokens: usageTokens(payload.usage, "prompt_tokens"),
  };
}

export async function completeAnswer(
  user: string,
  instruction: string = ANSWER_INSTRUCTION,
): Promise<AnswerResult> {
  const payload = await postJson(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      model: ANSWER_MODEL,
      messages: [
        { role: "system", content: instruction },
        { role: "user", content: user },
      ],
    },
    bearer("OPENROUTER_API_KEY"),
  );
  if (
    !isRecord(payload) ||
    typeof payload.model !== "string" ||
    !Array.isArray(payload.choices)
  ) {
    throw new Error("answer response was incomplete");
  }
  const choice = payload.choices[0];
  if (!isRecord(choice) || !isRecord(choice.message)) {
    throw new Error("answer message missing");
  }
  const text = messageText(choice.message.content);
  if (text.length === 0) {
    throw new Error("answer text was empty");
  }
  return {
    model: payload.model,
    text,
    inputTokens: usageTokens(payload.usage, "prompt_tokens"),
    outputTokens: usageTokens(payload.usage, "completion_tokens"),
  };
}

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

function usageTokens(usage: unknown, key: string): number | null {
  if (!isRecord(usage) || typeof usage[key] !== "number") {
    return null;
  }
  return usage[key];
}

function messageText(content: unknown): string {
  if (typeof content === "string") {
    return content.trim();
  }
  if (!Array.isArray(content)) {
    return "";
  }
  return content
    .map((part) => {
      if (typeof part === "string") {
        return part;
      }
      if (isRecord(part) && typeof part.text === "string") {
        return part.text;
      }
      return "";
    })
    .join("")
    .trim();
}
