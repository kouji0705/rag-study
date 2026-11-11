import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  amountIsAffirmed,
  judgeAbstention,
  negatesAmount,
  reviseOnce,
  revisionRequest,
  validateEvaluation,
} from "./answer-evaluation.ts";
import {
  embeddingModelsCompatible,
  hashCorpus,
  idDiff,
  indexFingerprint,
  upsertBodies,
} from "./corpus.ts";
import {
  loadCases,
  naiveUser,
  retrievalLabel,
  runEval,
  runOnSharedHits,
} from "./eval-run.ts";
import { RELATIONS, walkRelations } from "./graph.ts";
import { graphUserText, limitPassages, topStarts } from "./graph-text.ts";
import { keepByScore } from "./hierarchy-policy.ts";
import { runHopLoop } from "./hop-policy.ts";
import { splitMarkdown } from "./manual.ts";
import {
  GENERIC_SCORE_CRITERIA,
  HOP_B_CRITERIA,
  HOP_C_CRITERIA,
  HOP_CRITERIA,
  HOP_FACT_CRITERIA,
  Q09_COVERAGE_ITEMS,
} from "./models.ts";

test("corpus hash changes when one character changes and ignores newline style", () => {
  const left = hashCorpus([{ path: "a.md", text: "30日\n" }]);
  const crlf = hashCorpus([{ path: "a.md", text: "30日\r\n" }]);
  const changed = hashCorpus([{ path: "a.md", text: "60日\n" }]);
  assert.equal(left, crlf);
  assert.notEqual(left, changed);
});

test("embedding model names match after the vendor prefix", () => {
  assert.equal(
    embeddingModelsCompatible(
      "openai/text-embedding-3-small",
      "text-embedding-3-small",
    ),
    true,
  );
  assert.equal(
    embeddingModelsCompatible(
      "openai/text-embedding-3-small",
      "openai/text-embedding-3-large",
    ),
    false,
  );
});

test("fingerprint changes with the split version", () => {
  const base = {
    corpusHash: "abc",
    splitVersion: "heading-v1",
    requestedModel: "openai/text-embedding-3-small",
    dimensions: 1536,
    space: "cosine",
  };
  assert.notEqual(
    indexFingerprint(base),
    indexFingerprint({ ...base, splitVersion: "heading-v2" }),
  );
});

test("upsert keeps an id that the next batch does not mention", () => {
  const first = upsertBodies(new Map(), [
    { id: "old", body: "30日" },
    { id: "kept", body: "満額" },
  ]);
  const second = upsertBodies(first, [{ id: "kept", body: "満額" }]);
  assert.equal(second.size, 2);
  assert.deepEqual(idDiff([...second.keys()], ["kept"]), {
    missing: [],
    unexpected: ["old"],
  });
});

test("fallback top1 keeps billing and top2 also keeps withdrawal", () => {
  const scores = [
    { name: "アカウント", score: 0.55 },
    { name: "請求", score: 1.27 },
    { name: "退会", score: 1.26 },
  ];
  assert.deepEqual(
    keepByScore(scores, 2, "top1").map((item) => item.name),
    ["請求"],
  );
  assert.deepEqual(
    keepByScore(scores, 2, "top2").map((item) => item.name),
    ["請求", "退会"],
  );
});

test("scores at or above the minimum stay in their original order", () => {
  const scores = [
    { name: "先", score: 2 },
    { name: "後", score: 3 },
  ];
  assert.deepEqual(
    keepByScore(scores, 2, "top1").map((item) => item.name),
    ["先", "後"],
  );
});

test("hop stops without a rewrite when the choice is done", async () => {
  let rewrites = 0;
  const result = await runHopLoop({
    initialQuery: "質問",
    initialDocuments: [{ id: "a" }],
    criteria: { plan: "plan", done: "done" },
    maxSearches: 3,
    choose: async () => ({ choice: "done" }),
    rewrite: async () => {
      rewrites += 1;
      return "next";
    },
    search: async () => [{ id: "b" }],
    embed: async () => undefined,
  });
  assert.equal(result.stopReason, "criteria_done");
  assert.equal(rewrites, 0);
  assert.equal(result.embedCalls, 0);
});

test("the same ids stop as no progress", async () => {
  const result = await runHopLoop({
    initialQuery: "質問",
    initialDocuments: [{ id: "a" }],
    criteria: { plan: "plan", done: "done" },
    maxSearches: 3,
    choose: async () => ({ choice: "plan" }),
    rewrite: async () => "別の検索",
    search: async () => [{ id: "a" }],
    embed: async () => undefined,
  });
  assert.equal(result.stopReason, "no_progress");
  assert.equal(result.cause, "no_new_ids");
});

test("a repeated query does not call embed", async () => {
  let embeds = 0;
  const result = await runHopLoop({
    initialQuery: "同じ検索",
    initialDocuments: [{ id: "a" }],
    criteria: { plan: "plan", done: "done" },
    maxSearches: 3,
    choose: async () => ({ choice: "plan" }),
    rewrite: async () => "  同じ検索  ",
    search: async () => [{ id: "b" }],
    embed: async () => {
      embeds += 1;
    },
  });
  assert.equal(result.stopReason, "no_progress");
  assert.equal(embeds, 0);
});

test("an empty query does not call embed", async () => {
  let embeds = 0;
  const result = await runHopLoop({
    initialQuery: "質問",
    initialDocuments: [{ id: "a" }],
    criteria: { plan: "plan", done: "done" },
    maxSearches: 3,
    choose: async () => ({ choice: "plan" }),
    rewrite: async () => "   ",
    search: async () => [{ id: "b" }],
    embed: async () => {
      embeds += 1;
    },
  });
  assert.equal(result.stopReason, "invalid_query");
  assert.equal(embeds, 0);
});

test("search stops at three including the first", async () => {
  let generated = 0;
  const result = await runHopLoop({
    initialQuery: "質問",
    initialDocuments: [{ id: "a" }],
    criteria: { plan: "plan", done: "done" },
    maxSearches: 3,
    choose: async () => ({ choice: "plan" }),
    rewrite: async () => {
      generated += 1;
      return `query-${generated}`;
    },
    search: async () => [{ id: `new-${generated}` }],
    embed: async () => undefined,
  });
  assert.equal(result.stopReason, "max_searches");
  assert.equal(result.searches, 3);
});

test("an unknown choice is a run error", async () => {
  const result = await runHopLoop({
    initialQuery: "質問",
    initialDocuments: [{ id: "a" }],
    criteria: { done: "done" },
    maxSearches: 3,
    choose: async () => ({ choice: "maybe" }),
    rewrite: async () => "query",
    search: async () => [],
    embed: async () => undefined,
  });
  assert.equal(result.stopReason, "run_error");
});

test("criteria B changes only done, and C adds price without rewriting B", () => {
  assert.equal(HOP_B_CRITERIA.plan, HOP_CRITERIA.plan);
  assert.equal(HOP_B_CRITERIA.billing, HOP_CRITERIA.billing);
  assert.equal(HOP_B_CRITERIA.deletion, HOP_CRITERIA.deletion);
  assert.notEqual(HOP_B_CRITERIA.done, HOP_CRITERIA.done);
  assert.equal(HOP_C_CRITERIA.plan, HOP_B_CRITERIA.plan);
  assert.equal(HOP_C_CRITERIA.billing, HOP_B_CRITERIA.billing);
  assert.equal(HOP_C_CRITERIA.deletion, HOP_B_CRITERIA.deletion);
  assert.equal(HOP_C_CRITERIA.done, HOP_B_CRITERIA.done);
  assert.equal("price" in HOP_B_CRITERIA, false);
  assert.notEqual(HOP_FACT_CRITERIA.plan, HOP_CRITERIA.plan);
});

test("generic criteria and coverage items do not contain gold answers", () => {
  const text = [...GENERIC_SCORE_CRITERIA, ...Q09_COVERAGE_ITEMS].join("\n");
  assert.equal(text.includes("満額"), false);
  assert.equal(text.includes("12000"), false);
  assert.equal(text.includes("30日"), false);
  assert.equal(text.includes("Pro"), false);
});

test("a negated amount is not treated as support", () => {
  assert.equal(negatesAmount("12,000円ではありません", "12000"), true);
  assert.equal(amountIsAffirmed("12,000円ではありません", "12000"), false);
  assert.equal(amountIsAffirmed("月額は12000円です", "12000"), true);
});

test("appropriate and inappropriate abstention are different", () => {
  assert.equal(
    judgeAbstention({
      answer: "マニュアルから確認できない",
      evidencePresent: false,
    }),
    "appropriate",
  );
  assert.equal(
    judgeAbstention({
      answer: "資料から確認できない",
      evidencePresent: true,
    }),
    "inappropriate",
  );
});

test("missing coverage revises once and does not become complete", async () => {
  const missing = {
    support: "supported" as const,
    abstention: "not_abstention" as const,
    coverage: [
      {
        name: "請求額",
        span: "",
        evidenceId: "",
        quote: "",
        state: "missing" as const,
      },
    ],
  };
  let revisions = 0;
  const result = await reviseOnce({
    initial: "Pro・満額・30日",
    evaluate: async () => missing,
    revise: async () => {
      revisions += 1;
      return "まだ金額がない";
    },
  });
  assert.equal(revisions, 1);
  assert.equal(result.complete, false);
});

test("a citation of an unseen source is rejected", () => {
  assert.throws(
    () =>
      validateEvaluation(
        {
          support: "supported",
          abstention: "not_abstention",
          coverage: [
            {
              name: "月額",
              span: "12000円",
              evidenceId: "missing.md#月額",
              quote: "12000円",
              state: "answered",
            },
          ],
        },
        ["billing.md#Proプランの月額"],
      ),
    /unknown source/,
  );
});

test("a revision request lists missing names and not a hidden gold value", () => {
  const prompt = revisionRequest({
    question: "金額は？",
    documents: [{ id: "billing.md#Proプランの月額", text: "本文" }],
    previous: "Proです",
    missingItems: ["請求額"],
  });
  assert.match(prompt, /請求額/);
  assert.equal(prompt.includes("GOLD"), false);
});

test("one hop from SSO misses the price and two hops reach it", () => {
  const one = walkRelations(["SSO"], 1);
  const two = walkRelations(["SSO"], 2);
  assert.equal(
    one.some((edge) => edge.sourceId === "billing.md#Proプランの月額"),
    false,
  );
  assert.equal(
    two.some((edge) => edge.sourceId === "billing.md#Proプランの月額"),
    true,
  );
});

test("removing one edge keeps that source unreachable", () => {
  const relations = RELATIONS.filter(
    (edge) => edge.sourceId !== "billing.md#Proプランの月額",
  );
  const walked = walkRelations(["SSO"], 4, relations);
  assert.equal(
    walked.some((edge) => edge.sourceId === "billing.md#Proプランの月額"),
    false,
  );
});

test("more starts can add an unrelated source", () => {
  const ranked = [
    { name: "解約した月", similarity: 0.8 },
    { name: "SSO", similarity: 0.7 },
    { name: "契約開始", similarity: 0.6 },
    { name: "決済失敗から14日", similarity: 0.5 },
  ];
  const sources = (count: number) =>
    walkRelations(topStarts(ranked, count), 2).map((edge) => edge.sourceId);
  assert.deepEqual(sources(1), ["withdrawal.md#退会後の請求"]);
  assert.equal(sources(2).includes("billing.md#Proプランの月額"), true);
  assert.equal(sources(4).includes("billing.md#支払いの失敗"), true);
});

test("relation text is the only difference in the user message", () => {
  const plain = graphUserText({
    question: "いくら？",
    passages: "本文",
    relations: null,
  });
  const withRelations = graphUserText({
    question: "いくら？",
    passages: "本文",
    relations: "SSO —対応する→ Proプラン",
  });
  assert.equal(withRelations.includes("本文"), true);
  assert.equal(plain.includes("関係:"), false);
  assert.equal(
    withRelations.replace("\n\n関係:\nSSO —対応する→ Proプラン", ""),
    plain,
  );
});

test("a three passage cap drops the fourth source", () => {
  const result = limitPassages(["a", "b", "c", "d"], 3);
  assert.deepEqual(result.kept, ["a", "b", "c"]);
  assert.equal(result.omitted, 1);
});

test("the current splitter drops text above the first section heading", () => {
  const chunks = splitMarkdown(
    "withdrawal.md",
    "# 退会\n\n解約した月の料金は満額です。\n\n## 退会後のデータ削除\n\n退会完了から30日後にデータを削除します。\n",
  );
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0]?.body.includes("満額"), false);
  assert.match(chunks[0]?.body ?? "", /30日後/);
});

test("duplicate headings share an id", () => {
  const chunks = splitMarkdown(
    "billing.md",
    "# 請求\n\n## 月額\n\n980円です。\n\n## 月額\n\n12000円です。\n",
  );
  assert.equal(chunks[0]?.id, "billing.md#月額");
  assert.equal(chunks[1]?.id, "billing.md#月額");
});

test("a heading inside a code fence is still treated as a heading", () => {
  const chunks = splitMarkdown(
    "sample.md",
    "# 例\n\n## 本文\n\n次の例です。\n\n```\n## これは見出しではない\n```\n\n## 本当の見出し\n\n残る本文\n",
  );
  assert.equal(
    chunks.some((chunk) => chunk.heading === "これは見出しではない"),
    true,
  );
});

test("shared hits are passed to both runs without another search", async () => {
  const hits = [{ id: "same" }];
  const searches = 0;
  const seen: string[][] = [];
  await runOnSharedHits(hits, [
    async (shared) => {
      seen.push(shared.map((item) => item.id));
    },
    async (shared) => {
      seen.push(shared.map((item) => item.id));
    },
  ]);
  assert.equal(searches, 0);
  assert.deepEqual(seen, [["same"], ["same"]]);
});

test("the naive prompt does not include gold that is absent from the documents", async () => {
  const cases = await loadCases();
  const q01 = cases.find((item) => item.id === "Q01");
  assert.ok(q01);
  assert.equal(retrievalLabel(q01), "scored");
  const q10 = cases.find((item) => item.id === "Q10");
  assert.equal(q10 === undefined ? "" : retrievalLabel(q10), "not_applicable");
  let user = "";
  const code = await runEval({
    suite: "core",
    mode: "live",
    repeats: 1,
    cases: ["Q01"],
    methods: ["naive"],
    corpus: "taskflow-v18",
    documentsFor: async () => [
      { id: "withdrawal.md#退会後のデータ削除", heading: "削除", text: "本文" },
    ],
    answer: async (prompt) => {
      user = prompt;
      return {
        text: "確認しました",
        model: "test",
        inputTokens: null,
        outputTokens: null,
      };
    },
  });
  assert.equal(code, 0);
  assert.match(user, /退会後、データはいつ削除されますか？/);
  assert.equal(user.includes("退会完了から30日後"), false);
  assert.equal(
    naiveUser({ question: q01.question, documents: [] }).includes("gold"),
    false,
  );
});

test("dry-run does not need an answer function", async () => {
  const lines: string[] = [];
  const original = console.log;
  console.log = (...args: unknown[]) => {
    lines.push(args.join(" "));
  };
  try {
    const code = await runEval({
      suite: "core",
      mode: "dry-run",
      repeats: 1,
      cases: ["Q01"],
      methods: [],
    });
    assert.equal(code, 0);
  } finally {
    console.log = original;
  }
  assert.equal(
    lines.some((line) => line.includes("mode: dry-run")),
    true,
  );
  assert.equal(
    lines.some((line) => line.startsWith("max_calls:")),
    true,
  );
});

test("live without cases fails", async () => {
  const code = await runEval({
    suite: "core",
    mode: "live",
    repeats: 1,
    cases: [],
    methods: ["naive"],
  });
  assert.equal(code, 1);
});

test("replay of a missing run fails without calling fetch", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    throw new Error("fetch should not be called");
  };
  try {
    const directory = await mkdtemp(path.join(tmpdir(), "missing-run-"));
    process.env.ARTIFACTS_DIR = directory;
    const code = await runEval({
      suite: "core",
      mode: "replay",
      repeats: 1,
      cases: [],
      methods: [],
      runId: "missing",
    });
    assert.equal(code, 1);
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = original;
    delete process.env.ARTIFACTS_DIR;
  }
});

test("a one-character manual change is visible in a fixture file hash", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "corpus-"));
  await writeFile(path.join(directory, "b.md"), "あと\n", "utf8");
  await writeFile(path.join(directory, "a.md"), "30日\n", "utf8");
  const { readCorpusFiles } = await import("./corpus.ts");
  const files = await readCorpusFiles(directory);
  const changed = files.map((file) =>
    file.path === "a.md" ? { ...file, text: "60日\n" } : file,
  );
  assert.deepEqual(
    files.map((file) => file.path),
    ["a.md", "b.md"],
  );
  assert.notEqual(hashCorpus(files), hashCorpus(changed));
});
