import assert from "node:assert/strict";
import { test } from "node:test";
import { runVerifyFixture, VERIFY_FIXTURE_ANSWER } from "./verify-fixture.ts";

type Call = { url: string; body: Record<string, unknown> };

function judgment(choice: string) {
  return {
    model: "jev-test",
    answers: {
      decision: { choice, confidence: 1, probabilities: { [choice]: 1 } },
    },
    usage: { input_tokens: 1 },
  };
}

async function scenario(responses: unknown[]) {
  const saved = {
    fetch: globalThis.fetch,
    log: console.log,
    jev: process.env.JEV_API_KEY,
    router: process.env.OPENROUTER_API_KEY,
  };
  const calls: Call[] = [];
  const lines: string[] = [];
  process.env.JEV_API_KEY = "test-key";
  process.env.OPENROUTER_API_KEY = "test-key";
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
    assert.ok(responses.length > 0, "unexpected external call");
    return new Response(JSON.stringify(responses.shift()), { status: 200 });
  };
  console.log = (...args: unknown[]) => lines.push(args.join(" "));
  try {
    await runVerifyFixture();
    assert.equal(responses.length, 0, "all planned calls should execute");
    return { calls, lines };
  } finally {
    globalThis.fetch = saved.fetch;
    console.log = saved.log;
    if (saved.jev === undefined) delete process.env.JEV_API_KEY;
    else process.env.JEV_API_KEY = saved.jev;
    if (saved.router === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = saved.router;
  }
}

const revision = {
  model: "answer-test",
  choices: [
    { message: { content: "退会完了から30日後にデータを削除します。" } },
  ],
  usage: { prompt_tokens: 1, completion_tokens: 1 },
};

test("contradiction triggers one revision and rechecks the new answer", async () => {
  const { calls, lines } = await scenario([
    judgment("contradicted"),
    revision,
    judgment("supported"),
  ]);
  assert.equal(calls.length, 3);
  assert.ok(String(calls[0].body.state).includes(VERIFY_FIXTURE_ANSWER));
  assert.ok(String(calls[0].body.state).includes("退会完了から30日後"));
  assert.ok(calls[1].url.endsWith("/chat/completions"));
  const messages = calls[1].body.messages as { content: string }[];
  assert.ok(
    messages[1].content.includes(`直前の回答:\n${VERIFY_FIXTURE_ANSWER}`),
  );
  assert.ok(String(calls[2].body.state).includes("回答:\n退会完了から30日後"));
  assert.ok(!String(calls[2].body.state).includes("90日後"));
  assert.ok(lines.includes("final_source: revised"));
});

test("unsupported revision stops after one attempt and returns the fallback", async () => {
  const { lines } = await scenario([
    judgment("not_supported"),
    revision,
    judgment("not_supported"),
  ]);
  assert.ok(lines.includes("final_source: unconfirmed"));
  assert.ok(lines.includes("final_answer: マニュアルからは確認できません"));
});

test("an initial supported judgment does not call the answer model", async () => {
  const { calls, lines } = await scenario([judgment("supported")]);
  assert.equal(calls.length, 1);
  assert.ok(lines.includes("revision: skipped"));
  assert.ok(lines.includes(`final_answer: ${VERIFY_FIXTURE_ANSWER}`));
});

test("an unknown judgment fails without generating a revision", async () => {
  await assert.rejects(
    scenario([judgment("unknown")]),
    /unknown support choice/,
  );
});
