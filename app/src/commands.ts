import {
  countRecords,
  getOrCreateCollection,
  type Hit,
  printHit,
  queryCollection,
  readDocument,
  upsertChunks,
} from "./chroma.ts";
import {
  COMPARE_HOPS,
  COMPARE_STARTS,
  GRAPH_DEMO_HOPS,
  GRAPH_DEMO_QUESTION,
  GRAPH_DEMO_START,
  nodeNames,
  walkRelations,
} from "./graph.ts";
import { placeChunks } from "./hierarchy.ts";
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
  HIERARCHY_CRITERIA,
  HIERARCHY_INSTRUCTIONS,
  HIERARCHY_MIN_SCORE,
  HOP_CRITERIA,
  HOP_INSTRUCTIONS,
  HOP_REWRITE_INSTRUCTION,
  INCOMPLETE_INSTRUCTION,
  JEV_MODEL,
  MAX_ADDITIONAL_SEARCHES,
  MAX_HOPS,
  MORE_SEARCH_CRITERIA,
  MORE_SEARCH_INSTRUCTIONS,
  MULTI_QUESTION,
  PAYMENT_QUESTION,
  PLAN_EXIT_QUESTION,
  PRORATION_QUESTION,
  RERANK_CRITERIA,
  RERANK_INSTRUCTIONS,
  RETRIEVAL_CRITERIA,
  RETRIEVAL_INSTRUCTIONS,
  REVISE_INSTRUCTION,
  REWRITE_INSTRUCTION,
  STRATEGY_CRITERIA,
  STRATEGY_INSTRUCTIONS,
  SUPPORT_CRITERIA,
  SUPPORT_INSTRUCTIONS,
  TARGET_HEADING,
  TERM_QUESTION,
  UNCONFIRMED_ANSWER,
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

export async function runRetry(): Promise<void> {
  await compareRetry(PAYMENT_QUESTION, 3);
  await compareRetry(PRORATION_QUESTION, 3);
  await compareRetry(PRORATION_QUESTION, 2);
  await compareRetry(EXTEND_QUESTION, 3);
}

async function compareRetry(question: string, limit: number): Promise<void> {
  field("question", question);
  field("first_limit", limit);
  field("case", "naive");
  const naive = await searchHits(question, limit);
  field("search_count", 1);
  field("search_ms", naive.ms);
  field("embedding_tokens", naive.tokens);
  printHits(naive.hits);
  await printAnswer("naive", question, naive.hits);

  field("case", "retry");
  const first = await searchHits(question, limit);
  field("search_ms", first.ms);
  field("embedding_tokens", first.tokens);
  printHits(first.hits);
  const started = Date.now();
  const decision = await chooseOption(
    passageState(question, first.hits),
    RETRIEVAL_INSTRUCTIONS,
    { ...RETRIEVAL_CRITERIA },
  );
  field("choice", decision.choice);
  field("confidence", decimal(decision.confidence));
  printProbabilities(decision.probabilities);
  field("requested_jev_model", JEV_MODEL);
  field("response_jev_model", decision.model);
  field("jev_input_tokens", decision.inputTokens);
  field("jev_ms", Date.now() - started);
  if (decision.choice === "Correct") {
    field("search_count", 1);
    field("document_count", first.hits.length);
    await printAnswer("retry", question, first.hits);
    return;
  }
  if (decision.choice !== "Ambiguous" && decision.choice !== "Incorrect") {
    throw new Error(`unknown retrieval choice: ${decision.choice}`);
  }
  const rewriteStarted = Date.now();
  const rewritten = await completeAnswer(
    passageState(question, first.hits),
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
  const documents = mergeHits(first.hits, again.hits);
  field("search_count", 2);
  field("document_count", documents.length);
  printHits(documents);
  await printAnswer("retry", question, documents);
}

export async function runCompare(): Promise<void> {
  for (const question of [PRORATION_QUESTION, MULTI_QUESTION]) {
    await compareQuestion(question);
  }
}

async function compareQuestion(question: string): Promise<void> {
  field("question", question);
  field("case", "vector");
  const searched = await searchHits(question, 3);
  field("search_ms", searched.ms);
  field("embedding_tokens", searched.tokens);
  field("document_count", searched.hits.length);
  printHits(searched.hits);
  await printAnswer("vector", question, searched.hits);

  field("case", "graph");
  const names = nodeNames();
  const started = Date.now();
  const embedded = await embedTexts([question, ...names]);
  const query = embedded.vectors[0];
  if (query === undefined) {
    throw new Error("query embedding missing");
  }
  const ranked = names.map((name, index) => {
    const vector = embedded.vectors[index + 1];
    if (vector === undefined) {
      throw new Error(`node embedding missing: ${name}`);
    }
    return { name, similarity: cosineSimilarity(query, vector) };
  });
  ranked.sort((left, right) => right.similarity - left.similarity);
  field("node_embedding_tokens", embedded.tokens);
  field("node_embedding_ms", Date.now() - started);
  const starts = ranked.slice(0, COMPARE_STARTS);
  for (const start of starts) {
    field("start", start.name);
    field("similarity", decimal(start.similarity));
  }
  field("hops", COMPARE_HOPS);
  const edges = walkRelations(
    starts.map((start) => start.name),
    COMPARE_HOPS,
  );
  field("relation_count", edges.length);
  for (const edge of edges) {
    field("from", edge.from);
    field("relation", edge.relation);
    field("to", edge.to);
    field("source_id", edge.sourceId);
  }
  const chunks = await loadChunks();
  const sources: Chunk[] = [];
  for (const edge of edges) {
    const chunk = chunks.find((item) => item.id === edge.sourceId);
    if (chunk === undefined) {
      throw new Error(`relation source missing: ${edge.sourceId}`);
    }
    if (!sources.some((item) => item.id === chunk.id)) {
      sources.push(chunk);
    }
  }
  field("document_count", sources.length);
  for (const chunk of sources) {
    field("heading", chunk.heading);
  }
  const relationText = edges
    .map((edge) => `${edge.from} —${edge.relation}→ ${edge.to}`)
    .join("\n");
  const passages = sources
    .map((chunk) => `見出し: ${chunk.heading}\n${chunk.body}`)
    .join("\n\n");
  const answerStarted = Date.now();
  const answer = await completeAnswer(
    `質問:\n${question}\n\n関係:\n${relationText}\n\n文書:\n${passages}`,
    ANSWER_INSTRUCTION,
  );
  field("answer_label", "graph");
  field("requested_answer_model", ANSWER_MODEL);
  field("response_answer_model", answer.model);
  field("answer_input_tokens", answer.inputTokens);
  field("answer_output_tokens", answer.outputTokens);
  field("answer_ms", Date.now() - answerStarted);
  console.log("answer:");
  console.log(answer.text);
  console.log("---");
}

export async function runRelate(): Promise<void> {
  field("question", GRAPH_DEMO_QUESTION);
  field("start", GRAPH_DEMO_START);
  field("start_source", "manual");
  field("hops", GRAPH_DEMO_HOPS);
  const edges = walkRelations([GRAPH_DEMO_START], GRAPH_DEMO_HOPS);
  field("relation_count", edges.length);
  for (const edge of edges) {
    field("from", edge.from);
    field("relation", edge.relation);
    field("to", edge.to);
    field("source_id", edge.sourceId);
  }
  const chunks = await loadChunks();
  const sources = edges.map((edge) => {
    const chunk = chunks.find((item) => item.id === edge.sourceId);
    if (chunk === undefined) {
      throw new Error(`relation source missing: ${edge.sourceId}`);
    }
    return chunk;
  });
  const unique = sources.filter(
    (chunk, index) =>
      sources.findIndex((item) => item.id === chunk.id) === index,
  );
  field("document_count", unique.length);
  for (const chunk of unique) {
    field("heading", chunk.heading);
  }
  const relationText = edges
    .map((edge) => `${edge.from} —${edge.relation}→ ${edge.to}`)
    .join("\n");
  const passages = unique
    .map((chunk) => `見出し: ${chunk.heading}\n${chunk.body}`)
    .join("\n\n");
  const started = Date.now();
  const answer = await completeAnswer(
    `質問:\n${GRAPH_DEMO_QUESTION}\n\n関係:\n${relationText}\n\n文書:\n${passages}`,
    ANSWER_INSTRUCTION,
  );
  field("requested_answer_model", ANSWER_MODEL);
  field("response_answer_model", answer.model);
  field("answer_input_tokens", answer.inputTokens);
  field("answer_output_tokens", answer.outputTokens);
  field("answer_ms", Date.now() - started);
  console.log("answer:");
  console.log(answer.text);
  console.log("---");
}

export async function runHop(): Promise<void> {
  for (const question of [MULTI_QUESTION, DELETE_QUESTION]) {
    await hopQuestion(question);
  }
}

async function hopQuestion(question: string): Promise<void> {
  field("question", question);
  field("case", "naive");
  const naive = await searchHits(question, 3);
  field("search_count", 1);
  field("search_ms", naive.ms);
  field("embedding_tokens", naive.tokens);
  printHits(naive.hits);
  await printAnswer("naive", question, naive.hits);

  field("case", "hop");
  const first = await searchHits(question, 3);
  field("hop", 1);
  field("search_ms", first.ms);
  field("embedding_tokens", first.tokens);
  printHits(first.hits);
  let documents = first.hits;
  let searches = 1;
  let choice = "";
  while (true) {
    const started = Date.now();
    const decision = await chooseOption(
      passageState(question, documents),
      HOP_INSTRUCTIONS,
      {
        ...HOP_CRITERIA,
      },
    );
    choice = decision.choice;
    if (!(choice in HOP_CRITERIA)) {
      throw new Error(`unknown hop choice: ${choice}`);
    }
    field(`hop${searches}_choice`, choice);
    field(`hop${searches}_confidence`, decimal(decision.confidence));
    printProbabilities(decision.probabilities, `hop${searches}_probability`);
    field("requested_jev_model", JEV_MODEL);
    field("response_jev_model", decision.model);
    field(`hop${searches}_jev_input_tokens`, decision.inputTokens);
    field(`hop${searches}_jev_ms`, Date.now() - started);
    if (choice === "done" || searches >= MAX_HOPS) {
      break;
    }
    const gap = HOP_CRITERIA[choice as keyof typeof HOP_CRITERIA];
    const rewriteStarted = Date.now();
    const rewritten = await completeAnswer(
      `${passageState(question, documents)}\n\n不足:\n${gap}`,
      HOP_REWRITE_INSTRUCTION,
    );
    const nextQuery = rewritten.text.split("\n")[0]?.trim() ?? "";
    if (nextQuery.length === 0) {
      throw new Error("rewritten query was empty");
    }
    field("rewritten_query", nextQuery);
    field("rewrite_input_tokens", rewritten.inputTokens);
    field("rewrite_output_tokens", rewritten.outputTokens);
    field("rewrite_ms", Date.now() - rewriteStarted);
    const again = await searchHits(nextQuery, 3);
    field("additional_search_ms", again.ms);
    field("additional_embedding_tokens", again.tokens);
    field("case", "additional");
    printHits(again.hits);
    documents = mergeHits(documents, again.hits);
    searches += 1;
    field("hop", searches);
    printHits(documents);
  }
  field("search_count", searches);
  field("document_count", documents.length);
  field("final_choice", choice);
  await printAnswer(
    "hop",
    question,
    documents,
    choice === "done" ? ANSWER_INSTRUCTION : INCOMPLETE_INSTRUCTION,
  );
}

export async function runDescend(): Promise<void> {
  for (const question of [DELETE_QUESTION, PRORATION_QUESTION]) {
    await descendQuestion(question);
  }
}

type ScoredName = {
  name: string;
  state: string;
  score: number;
};

async function descendQuestion(question: string): Promise<void> {
  field("question", question);
  field("case", "naive");
  const naive = await searchHits(question, 3);
  field("search_count", 1);
  field("search_ms", naive.ms);
  field("embedding_tokens", naive.tokens);
  printHits(naive.hits);
  await printAnswer("naive", question, naive.hits);

  field("case", "descend");
  const placed = placeChunks(await loadChunks());
  const categories = uniqueNames(
    placed.map((item) => ({
      name: item.category,
      state: categoryState(question, item.category, placed),
    })),
  );
  const scoredCategories = await scoreLevel("category", categories);
  const keptCategories = keepLevel("category", scoredCategories);
  const groups = uniqueNames(
    placed
      .filter((item) => keptCategories.has(item.category))
      .map((item) => ({
        name: `${item.category}/${item.group}`,
        state: groupState(question, item.category, item.group, placed),
      })),
  );
  const scoredGroups = await scoreLevel("group", groups);
  const keptGroups = keepLevel("group", scoredGroups);
  const documents = placed.filter((item) =>
    keptGroups.has(`${item.category}/${item.group}`),
  );
  const scoredDocuments = await scoreLevel(
    "document",
    documents.map((item) => ({
      name: item.chunk.heading,
      state: `質問:\n${question}\n\n文書:\n${item.chunk.body}`,
      chunk: item.chunk,
    })),
  );
  const selected = [...scoredDocuments]
    .sort((left, right) => right.score - left.score)
    .slice(0, 3);
  field("selected_count", selected.length);
  for (let index = 0; index < selected.length; index += 1) {
    const item = selected[index];
    if (item !== undefined) {
      field("rank", index + 1);
      field("heading", item.name);
      field("score", decimal(item.score));
    }
  }
  await printAnswer(
    "descend",
    question,
    selected.map((item) => ({
      heading: item.name,
      document: item.chunk.body,
    })),
  );
}

function categoryState(
  question: string,
  category: string,
  placed: ReturnType<typeof placeChunks>,
): string {
  const lines = groupsIn(category, placed).map((group) => {
    const headings = placed
      .filter((item) => item.category === category && item.group === group)
      .map((item) => item.chunk.heading)
      .join("、");
    return `- ${group}: ${headings}`;
  });
  return `質問:\n${question}\n\nカテゴリ: ${category}\n${lines.join("\n")}`;
}

function groupState(
  question: string,
  category: string,
  group: string,
  placed: ReturnType<typeof placeChunks>,
): string {
  const headings = placed
    .filter((item) => item.category === category && item.group === group)
    .map((item) => item.chunk.heading)
    .join("、");
  return `質問:\n${question}\n\nカテゴリ: ${category}\nグループ: ${group}\n見出し: ${headings}`;
}

function groupsIn(
  category: string,
  placed: ReturnType<typeof placeChunks>,
): string[] {
  const names: string[] = [];
  for (const item of placed) {
    if (item.category === category && !names.includes(item.group)) {
      names.push(item.group);
    }
  }
  return names;
}

function uniqueNames<T extends { name: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const unique: T[] = [];
  for (const item of items) {
    if (!seen.has(item.name)) {
      seen.add(item.name);
      unique.push(item);
    }
  }
  return unique;
}

async function scoreLevel<T extends { name: string; state: string }>(
  level: string,
  items: T[],
): Promise<Array<T & ScoredName>> {
  const scored: Array<T & ScoredName> = [];
  let tokens = 0;
  let model = "";
  const started = Date.now();
  for (const item of items) {
    const result = await scoreDocument(
      item.state,
      HIERARCHY_INSTRUCTIONS,
      HIERARCHY_CRITERIA,
    );
    tokens += result.inputTokens;
    model = result.model;
    field("level", level);
    field("name", item.name);
    field("score", decimal(result.score));
    scored.push({ ...item, score: result.score });
  }
  field("requested_jev_model", JEV_MODEL);
  field("response_jev_model", model);
  field(`${level}_jev_input_tokens`, tokens);
  field(`${level}_jev_ms`, Date.now() - started);
  return scored;
}

function keepLevel(level: string, items: ScoredName[]): Set<string> {
  const passed = items.filter((item) => item.score >= HIERARCHY_MIN_SCORE);
  const kept = passed.length > 0 ? passed : [highest(items)];
  const fallback = passed.length === 0;
  const max = Math.max(...items.map((item) => item.score));
  const tie = items.filter((item) => item.score === max).length > 1;
  field(`${level}_fallback`, fallback ? "yes" : "no");
  field(`${level}_tie`, fallback && tie ? "yes" : "no");
  for (const item of kept) {
    field(`${level}_kept`, item.name);
    field(`${level}_kept_score`, decimal(item.score));
  }
  return new Set(kept.map((item) => item.name));
}

function highest(items: ScoredName[]): ScoredName {
  const top = items.reduce<ScoredName | undefined>((best, item) => {
    if (best === undefined || item.score > best.score) {
      return item;
    }
    return best;
  }, undefined);
  if (top === undefined) {
    throw new Error("hierarchy level was empty");
  }
  return top;
}

export async function runVerify(): Promise<void> {
  for (const question of [EXTEND_QUESTION, DELETE_QUESTION]) {
    await verifyQuestion(question);
  }
}

async function verifyQuestion(question: string): Promise<void> {
  field("question", question);
  const searched = await searchHits(question, 3);
  field("search_count", 1);
  field("search_ms", searched.ms);
  field("embedding_tokens", searched.tokens);
  printHits(searched.hits);
  const initial = await generateAnswer(
    "initial",
    question,
    searched.hits,
    ANSWER_INSTRUCTION,
  );
  const first = await judgeSupport(
    question,
    searched.hits,
    initial.text,
    "first",
  );
  if (first.choice === "supported") {
    field("revision", "skipped");
    field("final_source", "initial");
    console.log("final_answer:");
    console.log(initial.text);
    console.log("---");
    return;
  }
  if (first.choice !== "not_supported" && first.choice !== "contradicted") {
    throw new Error(`unknown support choice: ${first.choice}`);
  }
  const revised = await generateAnswer(
    "revised",
    question,
    searched.hits,
    REVISE_INSTRUCTION,
    initial.text,
  );
  const second = await judgeSupport(
    question,
    searched.hits,
    revised.text,
    "second",
  );
  if (
    second.choice !== "supported" &&
    second.choice !== "not_supported" &&
    second.choice !== "contradicted"
  ) {
    throw new Error(`unknown support choice: ${second.choice}`);
  }
  const adopted = second.choice === "supported";
  field("final_source", adopted ? "revised" : "unconfirmed");
  console.log("final_answer:");
  console.log(adopted ? revised.text : UNCONFIRMED_ANSWER);
  console.log("---");
}

async function judgeSupport(
  question: string,
  hits: Hit[],
  answer: string,
  label: string,
): Promise<{ choice: string }> {
  const started = Date.now();
  const decision = await chooseOption(
    `${passageState(question, hits)}\n\n回答:\n${answer}`,
    SUPPORT_INSTRUCTIONS,
    { ...SUPPORT_CRITERIA },
  );
  field(`${label}_choice`, decision.choice);
  field(`${label}_confidence`, decimal(decision.confidence));
  printProbabilities(decision.probabilities, `${label}_probability`);
  field(`${label}_requested_jev_model`, JEV_MODEL);
  field(`${label}_response_jev_model`, decision.model);
  field(`${label}_jev_input_tokens`, decision.inputTokens);
  field(`${label}_jev_ms`, Date.now() - started);
  return decision;
}

async function generateAnswer(
  label: string,
  question: string,
  hits: Hit[],
  instruction: string,
  previous?: string,
): Promise<{ text: string }> {
  const passages = hits
    .map((hit) => `見出し: ${hit.heading}\n${hit.document}`)
    .join("\n\n");
  const previousText =
    previous === undefined ? "" : `\n\n直前の回答:\n${previous}`;
  const started = Date.now();
  const answer = await completeAnswer(
    `質問:\n${question}\n\n文書:\n${passages}${previousText}`,
    instruction,
  );
  field("answer_label", label);
  field("requested_answer_model", ANSWER_MODEL);
  field("response_answer_model", answer.model);
  field("answer_input_tokens", answer.inputTokens);
  field("answer_output_tokens", answer.outputTokens);
  field("answer_ms", Date.now() - started);
  console.log("answer:");
  console.log(answer.text);
  console.log("---");
  return answer;
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
  for (const passCount of [1, 2, 3]) {
    await answerSelection("naive", hits.slice(0, passCount));
    await answerSelection("rerank", ranked.slice(0, passCount));
  }
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
  await answerSelection("rerank-excluded", excludedRanked.slice(0, 3));
}

async function answerSelection(
  method: string,
  hits: { heading: string; document: string; score?: number }[],
): Promise<void> {
  field("case", `${method}-top${hits.length}`);
  field("pass_count", hits.length);
  for (const hit of hits) {
    field("passed_heading", hit.heading);
    if (typeof hit.score === "number") {
      field("passed_score", decimal(hit.score));
    }
  }
  await printAnswer(`${method}-top${hits.length}`, PRORATION_QUESTION, hits);
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
  hits: { heading: string; document: string }[],
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
    field("jev_usefulness", JSON.stringify(result.usefulness));
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

function printProbabilities(
  probabilities: Record<string, number>,
  prefix = "probability",
): void {
  for (const [key, value] of Object.entries(probabilities)) {
    field(`${prefix}_${key}`, decimal(value));
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
