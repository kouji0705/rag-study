import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { artifactsDir, repoRoot } from "./corpus.ts";
import { field } from "./http.ts";

export type EvalCase = {
  id: string;
  question: string;
  answerability: "manual" | "unanswerable" | "general";
  requiredItems: string[];
  evidenceGroups: string[][];
  forbiddenClaims: string[];
  split: "tune" | "eval";
  gold: { claims: string[] };
};

export type MethodBudget = {
  method: string;
  maxCalls: number;
  note: string;
};

export const METHOD_BUDGETS: readonly MethodBudget[] = [
  { method: "naive", maxCalls: 2, note: "Embedding 1 + 回答 1" },
  {
    method: "rerank-specialized",
    maxCalls: 12,
    note: "Embedding 1 + 採点 10 + 回答 1",
  },
  { method: "rerank-generic", maxCalls: 12, note: "専用基準と同じ上限" },
  {
    method: "exclude",
    maxCalls: 11,
    note: "Embedding 1 + 採点 10。0件なら回答生成なし",
  },
  {
    method: "route",
    maxCalls: 6,
    note: "判定、検索、追加判定、検索文、追加検索、回答の上限",
  },
  {
    method: "retry",
    maxCalls: 5,
    note: "初回検索、判定、検索文、追加検索、回答",
  },
  {
    method: "hop",
    maxCalls: 10,
    note: "初回込み検索3、判定3、検索文2、回答1の上限",
  },
  { method: "verify", maxCalls: 5, note: "検索1、回答2、判定2" },
  {
    method: "descend",
    maxCalls: 30,
    note: "カテゴリ、グループ、残った枝の文書、回答の上限",
  },
  {
    method: "graph",
    maxCalls: 2,
    note: "質問とノードのEmbedding 1回と回答1。探索自体に追加APIはない",
  },
];

const LIVE_METHODS = new Set(["naive"]);

export function casesPath(): string {
  return path.join(repoRoot(), "eval", "cases.json");
}

export async function loadCases(): Promise<EvalCase[]> {
  const payload = JSON.parse(await readFile(casesPath(), "utf8")) as {
    cases?: EvalCase[];
  };
  if (!Array.isArray(payload.cases)) {
    throw new Error("eval cases missing");
  }
  return payload.cases;
}

export function retrievalLabel(
  evalCase: EvalCase,
): "scored" | "not_applicable" {
  if (
    evalCase.answerability === "unanswerable" ||
    evalCase.answerability === "general"
  ) {
    return "not_applicable";
  }
  return "scored";
}

export function naiveUser(input: {
  question: string;
  documents: readonly { heading: string; text: string }[];
}): string {
  if (input.documents.length === 0) {
    return `質問:\n${input.question}`;
  }
  const passages = input.documents
    .map((item) => `見出し: ${item.heading}\n${item.text}`)
    .join("\n\n");
  return `質問:\n${input.question}\n\n文書:\n${passages}`;
}

export async function runOnSharedHits<T>(
  hits: readonly T[],
  runs: readonly ((hits: readonly T[]) => Promise<void>)[],
): Promise<void> {
  for (const run of runs) {
    await run(hits);
  }
}

export async function runEval(input: {
  suite: string;
  corpus?: string;
  mode: string;
  repeats: number;
  cases: readonly string[];
  methods: readonly string[];
  runId?: string;
  answer?: (user: string) => Promise<{
    text: string;
    model: string;
    inputTokens: number | null;
    outputTokens: number | null;
  }>;
  documentsFor?: (
    evalCase: EvalCase,
  ) => Promise<readonly { id: string; heading: string; text: string }[]>;
}): Promise<number> {
  if (input.suite !== "core") {
    console.error(`unknown suite: ${input.suite}`);
    return 1;
  }
  const all = await loadCases();
  const selected =
    input.cases.length === 0
      ? all
      : all.filter((item) => input.cases.includes(item.id));
  if (
    selected.length !==
    (input.cases.length === 0 ? all.length : input.cases.length)
  ) {
    console.error("unknown case id");
    return 1;
  }
  if (input.mode === "dry-run") {
    printDryRun(selected, input.repeats, input.corpus);
    return 0;
  }
  if (input.mode === "replay") {
    if (input.runId === undefined || input.runId.length === 0) {
      console.error("replay requires --run");
      return 1;
    }
    return replayRun(input.runId);
  }
  if (input.mode !== "live") {
    console.error(`unknown eval mode: ${input.mode}`);
    return 1;
  }
  if (input.cases.length === 0) {
    console.error("live mode requires --cases");
    return 1;
  }
  const methods = input.methods.length === 0 ? ["naive"] : [...input.methods];
  const unsupported = methods.filter((method) => !LIVE_METHODS.has(method));
  if (unsupported.length > 0) {
    console.error(`live method is not wired: ${unsupported.join(",")}`);
    return 1;
  }
  if (input.answer === undefined || input.documentsFor === undefined) {
    console.error("live naive runner is not configured");
    return 1;
  }
  for (const evalCase of selected) {
    for (let repeat = 1; repeat <= input.repeats; repeat += 1) {
      const documents = await input.documentsFor(evalCase);
      const user = naiveUser({
        question: evalCase.question,
        documents: documents.map((item) => ({
          heading: item.heading,
          text: item.text,
        })),
      });
      const started = Date.now();
      const answer = await input.answer(user);
      await writeLiveRun({
        evalCase,
        repeat,
        corpus: input.corpus ?? null,
        user,
        documents,
        answer,
        durationMs: Date.now() - started,
      });
    }
  }
  return 0;
}

function printDryRun(
  cases: readonly EvalCase[],
  repeats: number,
  corpus: string | undefined,
): void {
  field("mode", "dry-run");
  field("suite", "core");
  field("corpus", corpus ?? "unspecified");
  field("case_count", cases.length);
  field("repeats", repeats);
  let upper = 0;
  for (const item of cases) {
    field("case", item.id);
    field("question", item.question);
    field("answerability", item.answerability);
    field("retrieval", retrievalLabel(item));
  }
  for (const method of METHOD_BUDGETS) {
    field("method", method.method);
    field("max_calls", method.maxCalls);
    field("note", method.note);
    upper += method.maxCalls * cases.length * repeats;
  }
  field("max_calls_if_every_method_ran", upper);
  field(
    "live_default",
    "selected cases and an explicit method; naive only is wired",
  );
}

async function replayRun(runId: string): Promise<number> {
  const directory = path.join(artifactsDir(), "runs", runId);
  try {
    const summary = await readFile(path.join(directory, "summary.md"), "utf8");
    console.log(summary);
    return 0;
  } catch (error) {
    if (isMissing(error)) {
      console.error(`run not found: ${runId}`);
      return 1;
    }
    throw error;
  }
}

async function writeLiveRun(input: {
  evalCase: EvalCase;
  repeat: number;
  corpus: string | null;
  user: string;
  documents: readonly { id: string; heading: string; text: string }[];
  answer: {
    text: string;
    model: string;
    inputTokens: number | null;
    outputTokens: number | null;
  };
  durationMs: number;
}): Promise<void> {
  const git = gitMetadata();
  const id = `${stamp()}-${input.evalCase.id}-naive-${input.repeat}`;
  const directory = path.join(artifactsDir(), "runs", id);
  await mkdir(directory, { recursive: true });
  const result = {
    id,
    createdAt: new Date().toISOString(),
    gitSha: git.sha,
    dirty: git.dirty,
    caseId: input.evalCase.id,
    method: "naive",
    repeat: input.repeat,
    corpus: input.corpus,
    retrieval: retrievalLabel(input.evalCase),
    status: "completed",
    documentIds: input.documents.map((item) => item.id),
    answer: input.answer.text,
    responseModel: input.answer.model,
    usage: {
      inputTokens: input.answer.inputTokens,
      outputTokens: input.answer.outputTokens,
    },
  };
  const step = {
    seq: 1,
    role: "generation",
    startedAt: result.createdAt,
    endedAt: result.createdAt,
    durationMs: input.durationMs,
    inputRef: "user",
    outputRef: "answer",
    requestedModel: null,
    responseModel: input.answer.model,
    usage: result.usage,
    attempts: 1,
  };
  await writeFile(
    path.join(directory, "steps.jsonl"),
    `${JSON.stringify(step)}\n`,
    "utf8",
  );
  await writeFile(path.join(directory, "user.txt"), input.user, "utf8");
  await writeFile(
    path.join(directory, "result.json"),
    `${JSON.stringify(result, null, 2)}\n`,
    "utf8",
  );
  const summary = [
    `# ${id}`,
    "",
    `case: ${input.evalCase.id}`,
    `method: naive`,
    `retrieval: ${result.retrieval}`,
    `usage input: ${formatUsage(input.answer.inputTokens)}`,
    `usage output: ${formatUsage(input.answer.outputTokens)}`,
    "",
    input.answer.text,
    "",
  ].join("\n");
  await writeFile(path.join(directory, "summary.md"), summary, "utf8");
  field("run_id", id);
  field("case", input.evalCase.id);
  field("retrieval", result.retrieval);
}

function formatUsage(value: number | null): string {
  return value === null ? "unavailable" : String(value);
}

function stamp(): string {
  return new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d+Z$/, "Z");
}

function gitMetadata(): { sha: string | null; dirty: boolean | null } {
  try {
    const sha = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: repoRoot(),
      encoding: "utf8",
    }).trim();
    const dirty =
      execFileSync("git", ["status", "--porcelain"], {
        cwd: repoRoot(),
        encoding: "utf8",
      }).trim().length > 0;
    return { sha, dirty };
  } catch {
    return { sha: null, dirty: null };
  }
}

function isMissing(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}
