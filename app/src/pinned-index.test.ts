import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { corpusDirectory } from "./corpus.ts";
import { loadChunks } from "./manual.ts";
import { indexCorpus, verifyIndex } from "./pinned-index.ts";

const vector = Array.from({ length: 1536 }, () => 0.01);

test("indexing the fixed corpus verifies every id and rejects a body mismatch", async () => {
  const artifacts = await mkdtemp(path.join(tmpdir(), "index-"));
  process.env.ARTIFACTS_DIR = artifacts;
  process.env.OPENROUTER_API_KEY = "test-key";
  const savedFetch = globalThis.fetch;
  const stored = new Map<string, string>();
  let tamper = false;
  const urls: string[] = [];
  globalThis.fetch = async (url, init) => {
    const target = String(url);
    urls.push(target);
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    if (target.includes("/embeddings")) {
      const input = body.input as string[];
      return json({
        model: "text-embedding-3-small",
        data: input.map((_, index) => ({ index, embedding: vector })),
        usage: { prompt_tokens: 10 },
      });
    }
    if (target.endsWith("/upsert")) {
      const ids = body.ids as string[];
      const documents = body.documents as string[];
      for (let index = 0; index < ids.length; index += 1) {
        stored.set(ids[index] ?? "", documents[index] ?? "");
      }
      return json({});
    }
    if (target.endsWith("/get")) {
      const ids = [...stored.keys()];
      return json({
        ids,
        documents: ids.map((id) =>
          tamper && id.endsWith("退会後のデータ削除")
            ? "壊れた本文"
            : stored.get(id),
        ),
      });
    }
    if (init?.method === "POST") {
      assert.equal(body.name?.startsWith("tf"), true);
      assert.notEqual(body.name, "taskflow");
      return json({
        id: "collection-1",
        name: body.name,
        configuration: { hnsw: { space: "cosine" } },
      });
    }
    return json([
      {
        id: "collection-1",
        name: body.name,
        configuration: { hnsw: { space: "cosine" } },
      },
    ]);
  };
  try {
    const chunks = await loadChunks(corpusDirectory("taskflow-v18"));
    assert.equal(chunks.length, 18);
    assert.equal(await indexCorpus("taskflow-v18"), 0);
    assert.equal(stored.size, 18);
    assert.equal(await indexCorpus("taskflow-v18"), 0);
    assert.equal(stored.size, 18);
    tamper = true;
    assert.equal(await indexCorpus("taskflow-v18"), 1);
    assert.equal(
      urls.some((url) => url.includes("delete")),
      false,
    );
    tamper = false;
    stored.clear();
    assert.equal(await verifyIndex("taskflow-v18"), 1);
  } finally {
    globalThis.fetch = savedFetch;
    delete process.env.ARTIFACTS_DIR;
  }
});

function json(payload: unknown): Response {
  return new Response(JSON.stringify(payload), { status: 200 });
}
