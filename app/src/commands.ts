import {
  countRecords,
  getOrCreateCollection,
  type Hit,
  printHit,
  queryCollection,
  readDocument,
  upsertChunks,
} from "./chroma.ts";
import { decimal, field } from "./http.ts";
import { chooseOption, scoreDocument } from "./jev.ts";
import { type Chunk, loadChunks } from "./manual.ts";
import {
  ANSWER_INSTRUCTION,
  ANSWER_MODEL,
  DELETE_QUERY,
  DELETE_QUESTION,
  DELETE_SCORE_CRITERIA,
  DELETE_SCORE_INSTRUCTIONS,
  EMBEDDING_MODEL,
  EXCLUDE_MIN_SCORE,
  EXTEND_QUESTION,
  EXTEND_SCORE_CRITERIA,
  EXTEND_SCORE_INSTRUCTIONS,
  GENERAL_INSTRUCTION,
  JEV_MODEL,
  MAX_ADDITIONAL_SEARCHES,
  MORE_SEARCH_CRITERIA,
  MORE_SEARCH_INSTRUCTIONS,
  PLAN_EXIT_QUESTION,
  PRORATION_QUESTION,
  RERANK_CRITERIA,
  RERANK_INSTRUCTIONS,
  REWRITE_INSTRUCTION,
  STRATEGY_CRITERIA,
  STRATEGY_INSTRUCTIONS,
  TARGET_HEADING,
  TERM_QUESTION,
} from "./models.ts";
import { completeAnswer, cosineSimilarity, embedTexts } from "./openrouter.ts";

export async function runSplit(): Promise<void> {
  const chunks = await loadChunks();
  field("count", chunks.length);
  for (const chunk of chunks) {
    field("id", chunk.id);
    field("category", chunk.category);
    field("heading", chunk.heading);
    console.log("body:");
    console.log(chunk.body);
    console.log("---");
  }
}

export async function runEmbed(): Promise<void> {
  const chunks = await loadChunks();
  const deletion = requireChunk(chunks, "退会後のデータ削除");
  const billingDate = requireChunk(chunks, "請求日");
  const started = Date.now();
  const embedded = await embedTexts([
    deletion.body,
    billingDate.body,
    DELETE_QUERY,
  ]);
  field("requested_model", EMBEDDING_MODEL);
  field("response_model", embedded.model);
  field("dimensions", embedded.vectors[0]?.length ?? 0);
  field("embedding_tokens", embedded.tokens);
  field("embedding_ms", Date.now() - started);
  field("pair", "データはいつ削除される？ / 退会後のデータ削除");
  field(
    "cosine_similarity",
    decimal(cosineSimilarity(embedded.vectors[2], embedded.vectors[0])),
  );
  field("pair", "データはいつ削除される？ / 請求日");
  field(
    "cosine_similarity",
    decimal(cosineSimilarity(embedded.vectors[2], embedded.vectors[1])),
  );
}

export async function runIndex(): Promise<void> {
  const chunks = await loadChunks();
  const started = Date.now();
  const embedded = await embedTexts(chunks.map((chunk) => chunk.body));
  field("requested_model", EMBEDDING_MODEL);
  field("response_model", embedded.model);
  field("dimensions", embedded.vectors[0]?.length ?? 0);
  field("embedding_tokens", embedded.tokens);
  field("embedding_ms", Date.now() - started);

  const collection = await getOrCreateCollection();
  field("collection", "taskflow");
  field("space", collection.space);
  await upsertChunks(
    collection.id,
    chunks.map((chunk, index) => ({
      id: chunk.id,
      body: chunk.body,
      embedding: embedded.vectors[index],
      metadata: {
        heading: chunk.heading,
        category: chunk.category,
        source: chunk.source,
        title: chunk.title,
      },
    })),
  );
  const count = await countRecords(collection.id);
  field("count", count);
  field("expected_count", chunks.length);
  const sample = requireChunk(chunks, "退会後のデータ削除");
  const stored = await readDocument(collection.id, sample.id);
  field("readback", stored === sample.body ? "match" : "mismatch");

  const queryStarted = Date.now();
  const queryEmbedding = await embedTexts([DELETE_QUERY]);
  field("query", DELETE_QUERY);
  field("query_embedding_tokens", queryEmbedding.tokens);
  field("query_embedding_ms", Date.now() - queryStarted);
  const hits = await queryCollection(
    collection.id,
    queryEmbedding.vectors[0],
    3,
  );
  for (let index = 0; index < hits.length; index += 1) {
    printHit(index + 1, hits[index]);
  }
  const top = hits[0];
  const topIndex = chunks.findIndex((chunk) => chunk.id === top?.id);
  if (top !== undefined && topIndex >= 0) {
    const similarity = cosineSimilarity(
      queryEmbedding.vectors[0],
      embedded.vectors[topIndex],
    );
    field("top_cosine_similarity", decimal(similarity));
    field("top_distance_plus_similarity", decimal(top.distance + similarity));
  }
}

export async function runSearch(
  question: string,
  limit: number,
  category?: string,
): Promise<void> {
  const collection = await getOrCreateCollection();
  const count = await countRecords(collection.id);
  field("count", count);
  field("space", collection.space);
  await printQuery(collection.id, question, limit, category);
}

export async function runAnswer(question = ""): Promise<void> {
  const questions =
    question.length > 0 ? [question] : [DELETE_QUESTION, PRORATION_QUESTION];
  for (const item of questions) {
    await answerQuestion(item, 3, "naive");
  }
}

export async function runFilter(): Promise<void> {
  field("question", PRORATION_QUESTION);
  field("filter", "none");
  await printQuery(await collectionId(), PRORATION_QUESTION, 5);
  field("filter", "退会");
  await printQuery(await collectionId(), PRORATION_QUESTION, 5, "退会");
}

export async function runExclude(): Promise<void> {
  await excludeQuestion(
    DELETE_QUESTION,
    DELETE_SCORE_INSTRUCTIONS,
    DELETE_SCORE_CRITERIA,
  );
  await excludeQuestion(
    EXTEND_QUESTION,
    EXTEND_SCORE_INSTRUCTIONS,
    EXTEND_SCORE_CRITERIA,
  );
}

export async function runRoute(): Promise<void> {
  for (const question of [TERM_QUESTION, DELETE_QUESTION, PLAN_EXIT_QUESTION]) {
    await compareRoute(question);
  }
}

async function compareRoute(question: string): Promise<void> {
  field("question", question);
  field("case", "naive");
  const naive = await searchHits(question, 3);
  field("search_count", 1);
  field("search_ms", naive.ms);
  field("embedding_tokens", naive.tokens);
  printHits(naive.hits);
  await printAnswer("naive", question, naive.hits);

  field("case", "route");
  const decisionStarted = Date.now();
  const decision = await chooseOption(question, STRATEGY_INSTRUCTIONS, {
    ...STRATEGY_CRITERIA,
  });
  field("choice", decision.choice);
  field("confidence", decimal(decision.confidence));
  printProbabilities(decision.probabilities);
  field("requested_jev_model", JEV_MODEL);
  field("response_jev_model", decision.model);
  field("jev_input_tokens", decision.inputTokens);
  field("jev_ms", Date.now() - decisionStarted);

  if (decision.choice === "none") {
    field("search_count", 0);
    await printAnswer("route", question, [], GENERAL_INSTRUCTION);
    return;
  }
  if (decision.choice === "once") {
    const searched = await searchHits(question, 3);
    field("search_count", 1);
    field("search_ms", searched.ms);
    field("embedding_tokens", searched.tokens);
    printHits(searched.hits);
    await printAnswer("route", question, searched.hits);
    return;
  }
  if (decision.choice !== "multi") {
    throw new Error(`unknown strategy: ${decision.choice}`);
  }

  const first = await searchHits(question, 3);
  field("search_ms", first.ms);
  field("embedding_tokens", first.tokens);
  printHits(first.hits);
  let documents = first.hits;
  let searches = 1;
  for (let extra = 0; extra < MAX_ADDITIONAL_SEARCHES; extra += 1) {
    const followStarted = Date.now();
    const follow = await chooseOption(
      passageState(question, documents),
      MORE_SEARCH_INSTRUCTIONS,
      { ...MORE_SEARCH_CRITERIA },
    );
    field("follow_choice", follow.choice);
    field("follow_confidence", decimal(follow.confidence));
    printProbabilities(follow.probabilities);
    field("follow_jev_input_tokens", follow.inputTokens);
    field("follow_jev_ms", Date.now() - followStarted);
    if (follow.choice !== "more") {
      break;
    }
    const rewriteStarted = Date.now();
    const rewritten = await completeAnswer(
      passageState(question, documents),
      REWRITE_INSTRUCTION,
    );
    const nextQuery = rewritten.text.split("\n")[0]?.trim() ?? "";
    if (nextQuery.length === 0) {
      throw new Error("rewritten query was empty");
    }
    field("rewritten_query", nextQuery);
    field("rewrite_input_tokens", rewritten.inputTokens);
    field("rewrite_ms", Date.now() - rewriteStarted);
    const again = await searchHits(nextQuery, 3);
    field("additional_search_ms", again.ms);
    field("additional_embedding_tokens", again.tokens);
    field("case", "additional");
    printHits(again.hits);
    documents = mergeHits(documents, again.hits);
    searches += 1;
  }
  field("search_count", searches);
  field("document_count", documents.length);
  printHits(documents);
  await printAnswer("route", question, documents);
}

export async function runRerank(): Promise<void> {
  const collection = await getOrCreateCollection();
  const embedded = await embedTexts([PRORATION_QUESTION]);
  field("question", PRORATION_QUESTION);
  field("requested_model", EMBEDDING_MODEL);
  field("response_model", embedded.model);
  field("embedding_tokens", embedded.tokens);
  const hits = await queryCollection(collection.id, embedded.vectors[0], 10);
  field("case", "top10");
  const ranked = await rankByUsefulness(hits);
  const selected = ranked.slice(0, 3);
  await printAnswer("rerank", PRORATION_QUESTION, selected);
  const targetIncluded = hits.some((hit) => hit.heading === TARGET_HEADING);
  field("target_in_top10", targetIncluded ? "yes" : "no");
  if (!targetIncluded) {
    return;
  }
  const wider = await queryCollection(collection.id, embedded.vectors[0], 20);
  const excluded = wider
    .filter((hit) => hit.heading !== TARGET_HEADING)
    .slice(0, 10);
  field("case", "target-excluded");
  const excludedRanked = await rankByUsefulness(excluded);
  await printAnswer(
    "rerank-excluded",
    PRORATION_QUESTION,
    excludedRanked.slice(0, 3),
  );
}

async function answerQuestion(
  question: string,
  limit: number,
  label: string,
): Promise<void> {
  const collection = await getOrCreateCollection();
  const embedStarted = Date.now();
  const embedded = await embedTexts([question]);
  field("question", question);
  field("label", label);
  field("requested_embedding_model", EMBEDDING_MODEL);
  field("response_embedding_model", embedded.model);
  field("embedding_tokens", embedded.tokens);
  field("embedding_ms", Date.now() - embedStarted);
  const hits = await queryCollection(collection.id, embedded.vectors[0], limit);
  for (let index = 0; index < hits.length; index += 1) {
    printHit(index + 1, hits[index]);
  }
  await printAnswer(label, question, hits);
}

async function printAnswer(
  label: string,
  question: string,
  hits: Hit[],
  instruction: string = ANSWER_INSTRUCTION,
): Promise<void> {
  const passages = hits
    .map((hit) => `見出し: ${hit.heading}\n${hit.document}`)
    .join("\n\n");
  const user =
    hits.length === 0
      ? `質問:\n${question}`
      : `質問:\n${question}\n\n文書:\n${passages}`;
  const started = Date.now();
  const answer = await completeAnswer(user, instruction);
  field("answer_label", label);
  field("requested_answer_model", ANSWER_MODEL);
  field("response_answer_model", answer.model);
  field("answer_input_tokens", answer.inputTokens);
  field("answer_output_tokens", answer.outputTokens);
  field("answer_ms", Date.now() - started);
  console.log("answer:");
  console.log(answer.text);
  console.log("---");
}

async function printQuery(
  collectionId: string,
  question: string,
  limit: number,
  category?: string,
): Promise<void> {
  const embedded = await embedTexts([question]);
  field("question", question);
  field("embedding_tokens", embedded.tokens);
  if (category !== undefined) {
    field("category", category);
  }
  const hits = await queryCollection(
    collectionId,
    embedded.vectors[0],
    limit,
    category,
  );
  for (let index = 0; index < hits.length; index += 1) {
    printHit(index + 1, hits[index]);
  }
}

async function excludeQuestion(
  question: string,
  instructions: string,
  criteria: readonly string[],
): Promise<void> {
  const collection = await getOrCreateCollection();
  const embedStarted = Date.now();
  const embedded = await embedTexts([question]);
  field("question", question);
  field("requested_embedding_model", EMBEDDING_MODEL);
  field("response_embedding_model", embedded.model);
  field("embedding_tokens", embedded.tokens);
  field("embedding_ms", Date.now() - embedStarted);
  const hits = await queryCollection(collection.id, embedded.vectors[0], 10);
  field("candidates", hits.length);
  field("case", "naive");
  const naiveHits = hits.slice(0, 3);
  for (let index = 0; index < naiveHits.length; index += 1) {
    const hit = naiveHits[index];
    if (hit !== undefined) {
      printHit(index + 1, hit);
    }
  }
  await printAnswer("naive", question, naiveHits);
  field("case", "exclude");
  field("min_score", EXCLUDE_MIN_SCORE);
  const ranked = await rankByUsefulness(hits, instructions, criteria);
  const kept = ranked
    .filter((hit) => hit.score >= EXCLUDE_MIN_SCORE)
    .slice(0, 3);
  field("kept", kept.length);
  for (const hit of kept) {
    field("kept_heading", hit.heading);
    field("kept_score", decimal(hit.score));
  }
  if (kept.length === 0) {
    field("answer_label", "exclude");
    field("answer", "skipped");
    return;
  }
  await printAnswer("exclude", question, kept);
}

async function rankByUsefulness(
  hits: Hit[],
  instructions: string = RERANK_INSTRUCTIONS,
  criteria: readonly string[] = RERANK_CRITERIA,
): Promise<(Hit & { score: number })[]> {
  const started = Date.now();
  let tokens = 0;
  let model = "";
  const scored = [];
  for (const hit of hits) {
    const result = await scoreDocument(hit.document, instructions, criteria);
    tokens += result.inputTokens;
    model = result.model;
    scored.push({ ...hit, score: result.score });
    field("heading", hit.heading);
    field("distance", decimal(hit.distance));
    field("score", decimal(result.score));
  }
  field("requested_jev_model", JEV_MODEL);
  field("response_jev_model", model);
  field("jev_input_tokens", tokens);
  field("jev_ms", Date.now() - started);
  return scored.sort((left, right) => right.score - left.score);
}

async function searchHits(
  question: string,
  limit: number,
): Promise<{ hits: Hit[]; tokens: number; ms: number }> {
  const collection = await getOrCreateCollection();
  const started = Date.now();
  const embedded = await embedTexts([question]);
  const vector = embedded.vectors[0];
  if (vector === undefined) {
    throw new Error("query embedding missing");
  }
  const hits = await queryCollection(collection.id, vector, limit);
  return { hits, tokens: embedded.tokens, ms: Date.now() - started };
}

function printHits(hits: Hit[]): void {
  for (let index = 0; index < hits.length; index += 1) {
    const hit = hits[index];
    if (hit !== undefined) {
      printHit(index + 1, hit);
    }
  }
}

function printProbabilities(probabilities: Record<string, number>): void {
  for (const [key, value] of Object.entries(probabilities)) {
    field(`probability_${key}`, decimal(value));
  }
}

function passageState(question: string, hits: Hit[]): string {
  const passages = hits
    .map((hit) => `見出し: ${hit.heading}\n${hit.document}`)
    .join("\n\n");
  return `質問:\n${question}\n\n文書:\n${passages}`;
}

function mergeHits(current: Hit[], extra: Hit[]): Hit[] {
  const seen = new Set(current.map((hit) => hit.id));
  const merged = [...current];
  for (const hit of extra) {
    if (!seen.has(hit.id)) {
      seen.add(hit.id);
      merged.push(hit);
    }
  }
  return merged;
}

async function collectionId(): Promise<string> {
  const collection = await getOrCreateCollection();
  return collection.id;
}

function requireChunk(chunks: Chunk[], heading: string): Chunk {
  const chunk = chunks.find((item) => item.heading === heading);
  if (chunk === undefined) {
    throw new Error(`missing heading: ${heading}`);
  }
  return chunk;
}
