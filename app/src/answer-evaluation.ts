export type CoverageState =
  | "answered"
  | "missing"
  | "unsupported"
  | "contradicted";

export type CoverageItem = {
  name: string;
  span: string;
  evidenceId: string;
  quote: string;
  state: CoverageState;
};

export type SupportLabel = "supported" | "not_supported" | "contradicted";

export type AbstentionLabel =
  | "appropriate"
  | "inappropriate"
  | "not_abstention";

export type AnswerEvaluation = {
  support: SupportLabel;
  coverage: CoverageItem[];
  abstention: AbstentionLabel;
};

const SUPPORTS = new Set<SupportLabel>([
  "supported",
  "not_supported",
  "contradicted",
]);
const STATES = new Set<CoverageState>([
  "answered",
  "missing",
  "unsupported",
  "contradicted",
]);
const ABSTENTIONS = new Set<AbstentionLabel>([
  "appropriate",
  "inappropriate",
  "not_abstention",
]);

export function validateEvaluation(
  value: unknown,
  presentedIds: readonly string[],
): AnswerEvaluation {
  if (!isRecord(value)) {
    throw new Error("evaluation was not an object");
  }
  if (!isSupport(value.support) || !isAbstention(value.abstention)) {
    throw new Error("evaluation labels were invalid");
  }
  if (!Array.isArray(value.coverage)) {
    throw new Error("evaluation coverage was missing");
  }
  const presented = new Set(presentedIds);
  const coverage = value.coverage.map((item) => {
    if (
      !isRecord(item) ||
      typeof item.name !== "string" ||
      typeof item.span !== "string" ||
      typeof item.evidenceId !== "string" ||
      typeof item.quote !== "string" ||
      !isState(item.state)
    ) {
      throw new Error("coverage item was invalid");
    }
    if (item.evidenceId.length > 0 && !presented.has(item.evidenceId)) {
      throw new Error(`unknown source: ${item.evidenceId}`);
    }
    if (item.state === "answered" && item.span.trim().length === 0) {
      throw new Error("answered item had an empty span");
    }
    if (item.state === "answered" && item.quote.trim().length === 0) {
      throw new Error("answered item had an empty quote");
    }
    return {
      name: item.name,
      span: item.span,
      evidenceId: item.evidenceId,
      quote: item.quote,
      state: item.state,
    };
  });
  return { support: value.support, coverage, abstention: value.abstention };
}

export function negatesAmount(answer: string, amountDigits: string): boolean {
  const compact = answer.replace(/[,，]/g, "");
  const index = compact.indexOf(amountDigits);
  if (index === -1) {
    return false;
  }
  const window = compact.slice(index, index + amountDigits.length + 16);
  return /ではありません|ではない|ない/.test(window);
}

export function amountIsAffirmed(
  answer: string,
  amountDigits: string,
): boolean {
  const compact = answer.replace(/[,，]/g, "");
  return compact.includes(amountDigits) && !negatesAmount(answer, amountDigits);
}

export function looksLikeAbstention(answer: string): boolean {
  return /確認できません|確認できない|分からない|わかりません/.test(answer);
}

export function judgeAbstention(input: {
  answer: string;
  evidencePresent: boolean;
}): AbstentionLabel {
  if (!looksLikeAbstention(input.answer)) {
    return "not_abstention";
  }
  return input.evidencePresent ? "inappropriate" : "appropriate";
}

export function needsRevision(evaluation: AnswerEvaluation): boolean {
  if (
    evaluation.support === "not_supported" ||
    evaluation.support === "contradicted"
  ) {
    return true;
  }
  return evaluation.coverage.some((item) => item.state !== "answered");
}

export function missingItemNames(evaluation: AnswerEvaluation): string[] {
  return evaluation.coverage
    .filter((item) => item.state !== "answered")
    .map((item) => item.name);
}

export function revisionRequest(input: {
  question: string;
  documents: readonly { id: string; text: string }[];
  previous: string;
  missingItems: readonly string[];
}): string {
  const passages = input.documents
    .map((item) => `id: ${item.id}\n${item.text}`)
    .join("\n\n");
  const missing =
    input.missingItems.length === 0 ? "なし" : input.missingItems.join("、");
  return `質問:\n${input.question}\n\n文書:\n${passages}\n\n直前の回答:\n${input.previous}\n\n未充足の項目名:\n${missing}`;
}

export async function reviseOnce(input: {
  initial: string;
  evaluate: (answer: string) => Promise<AnswerEvaluation>;
  revise: (answer: string, missing: readonly string[]) => Promise<string>;
}): Promise<{
  answers: string[];
  evaluations: AnswerEvaluation[];
  reviseCalls: number;
  complete: boolean;
}> {
  const first = await input.evaluate(input.initial);
  if (!needsRevision(first)) {
    return {
      answers: [input.initial],
      evaluations: [first],
      reviseCalls: 0,
      complete: true,
    };
  }
  const revised = await input.revise(input.initial, missingItemNames(first));
  const second = await input.evaluate(revised);
  return {
    answers: [input.initial, revised],
    evaluations: [first, second],
    reviseCalls: 1,
    complete: !needsRevision(second),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isSupport(value: unknown): value is SupportLabel {
  return typeof value === "string" && SUPPORTS.has(value as SupportLabel);
}

function isState(value: unknown): value is CoverageState {
  return typeof value === "string" && STATES.has(value as CoverageState);
}

function isAbstention(value: unknown): value is AbstentionLabel {
  return typeof value === "string" && ABSTENTIONS.has(value as AbstentionLabel);
}
