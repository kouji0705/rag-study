import assert from "node:assert/strict";
import test from "node:test";
import { runExclude, runRerank } from "./commands.ts";

const vector = Array.from({ length: 1536 }, () => 0.01);
const question = "退会後、データはいつ削除されますか？";

test("a requested question is used for both scoring and the answer", async () => {
  const { calls } = await capture(async () => {
    await runRerank({ question, criteria: "generic" });
  }, [{ score: 3 }]);
  const score = calls.find((call) => call.url.includes("systemone"));
  const answer = calls.find((call) => call.url.includes("/chat/completions"));
  assert.ok(score);
  assert.ok(answer);
  assert.match(String(score.body.state), new RegExp(question));
  assert.equal(String(score.body.state).includes("満額"), false);
  const messages = answer.body.messages as { content: string }[];
  assert.match(messages[1]?.content ?? "", new RegExp(question));
});

test("thresholds reuse one score and do not generate when nothing remains", async () => {
  const { calls } = await capture(async () => {
    await runExclude({
      question,
      criteria: "generic",
      thresholds: [1, 2, 3],
    });
  }, [{ score: 0 }]);
  const scores = calls.filter((call) => call.url.includes("systemone"));
  const answers = calls.filter((call) =>
    call.url.includes("/chat/completions"),
  );
  assert.equal(scores.length, 1);
  assert.equal(answers.length, 1);
  const messages = answers[0]?.body.messages as { content: string }[];
  assert.match(messages[1]?.content ?? "", /Naive|質問/);
  assert.equal(
    calls.filter((call) => JSON.stringify(call.body).includes("insufficient"))
      .length,
    0,
  );
});

async function capture(
  run: () => Promise<void>,
  scores: { score: number }[],
): Promise<{ calls: { url: string; body: Record<string, unknown> }[] }> {
  const saved = {
    fetch: globalThis.fetch,
    log: console.log,
    jev: process.env.JEV_API_KEY,
    router: process.env.OPENROUTER_API_KEY,
  };
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  let scoreIndex = 0;
  process.env.JEV_API_KEY = "test-key";
  process.env.OPENROUTER_API_KEY = "test-key";
  console.log = () => undefined;
  globalThis.fetch = async (url, init) => {
    const target = String(url);
    const body = init?.body
      ? (JSON.parse(String(init.body)) as Record<string, unknown>)
      : {};
    calls.push({ url: target, body });
    if (target.includes("/embeddings")) {
      return json({
        model: "text-embedding-3-small",
        data: [{ index: 0, embedding: vector }],
        usage: { prompt_tokens: 4 },
      });
    }
    if (target.includes("/query")) {
      return json({
        ids: [["billing.md#支払いの失敗"]],
        documents: [["本文"]],
        distances: [[0.2]],
        metadatas: [[{ heading: "支払いの失敗", category: "請求" }]],
      });
    }
    if (target.includes("systemone")) {
      const score = scores[scoreIndex]?.score ?? 0;
      scoreIndex += 1;
      return json({
        model: "jev-test",
        answers: { usefulness: { score } },
        usage: { input_tokens: 2 },
      });
    }
    if (target.includes("/chat/completions")) {
      return json({
        model: "answer-test",
        choices: [{ message: { content: "確認しました" } }],
        usage: { prompt_tokens: 5, completion_tokens: 2 },
      });
    }
    return json({
      id: "collection-1",
      configuration: { hnsw: { space: "cosine" } },
    });
  };
  try {
    await run();
    return { calls };
  } finally {
    globalThis.fetch = saved.fetch;
    console.log = saved.log;
    restore("JEV_API_KEY", saved.jev);
    restore("OPENROUTER_API_KEY", saved.router);
  }
}

function restore(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

function json(payload: unknown): Response {
  return new Response(JSON.stringify(payload), { status: 200 });
}
