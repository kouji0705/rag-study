import { field } from "./http.ts";
import { chooseOption } from "./jev.ts";
import { loadChunks } from "./manual.ts";
import {
  ANSWER_MODEL,
  DELETE_QUESTION,
  JEV_MODEL,
  REVISE_INSTRUCTION,
  SUPPORT_CRITERIA,
  SUPPORT_INSTRUCTIONS,
  UNCONFIRMED_ANSWER,
} from "./models.ts";
import { completeAnswer } from "./openrouter.ts";

// A controlled input, not a claim that the answer model produced this error.
export const VERIFY_FIXTURE_ANSWER = "退会完了から90日後にデータを削除します。";

export async function runVerifyFixture(): Promise<void> {
  const chunk = (await loadChunks()).find(
    (item) => item.heading === "退会後のデータ削除",
  );
  if (chunk === undefined) {
    throw new Error("verification fixture document missing");
  }
  const user = `質問:\n${DELETE_QUESTION}\n\n文書:\n見出し: ${chunk.heading}\n${chunk.body}`;
  field("case", "controlled_wrong_answer");
  field("question", DELETE_QUESTION);
  field("document", chunk.body);
  field("initial_source", "fixed_fixture");
  field("initial_answer", VERIFY_FIXTURE_ANSWER);
  field("requested_jev_model", JEV_MODEL);

  const judge = async (answer: string, label: string): Promise<string> => {
    const result = await chooseOption(
      `${user}\n\n回答:\n${answer}`,
      SUPPORT_INSTRUCTIONS,
      { ...SUPPORT_CRITERIA },
    );
    if (!Object.hasOwn(SUPPORT_CRITERIA, result.choice)) {
      throw new Error(`unknown support choice: ${result.choice}`);
    }
    field(`${label}_response_model`, result.model);
    field(`${label}_choice`, result.choice);
    field(`${label}_confidence`, result.confidence);
    field(`${label}_probabilities`, JSON.stringify(result.probabilities));
    field(`${label}_input_tokens`, result.inputTokens);
    return result.choice;
  };

  const first = await judge(VERIFY_FIXTURE_ANSWER, "first");
  if (first === "supported") {
    field("revision", "skipped");
    field("final_source", "initial");
    field("final_answer", VERIFY_FIXTURE_ANSWER);
    return;
  }
  const revised = await completeAnswer(
    `${user}\n\n直前の回答:\n${VERIFY_FIXTURE_ANSWER}`,
    REVISE_INSTRUCTION,
  );
  field("requested_answer_model", ANSWER_MODEL);
  field("revised_response_model", revised.model);
  field("revised_answer", revised.text);
  field("revision_input_tokens", revised.inputTokens);
  field("revision_output_tokens", revised.outputTokens);
  const second = await judge(revised.text, "second");
  field("final_source", second === "supported" ? "revised" : "unconfirmed");
  field(
    "final_answer",
    second === "supported" ? revised.text : UNCONFIRMED_ANSWER,
  );
}
