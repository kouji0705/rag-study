export type HopStop =
  | { type: "criteria_done" }
  | { type: "no_progress"; cause: "repeated_query" | "no_new_ids" }
  | { type: "max_searches" }
  | { type: "invalid_query" }
  | { type: "run_error"; message: string };

export type HopDocument = {
  id: string;
};

export function normalizeSearchQuery(query: string): string {
  return query.trim().replace(/\s+/g, " ");
}

export function decideAfterChoice(input: {
  choice: string;
  criteria: Record<string, string>;
  searchCount: number;
  maxSearches: number;
}): HopStop | { type: "search_more"; gap: string } {
  if (!(input.choice in input.criteria)) {
    return {
      type: "run_error",
      message: `unknown hop choice: ${input.choice}`,
    };
  }
  if (input.choice === "done") {
    return { type: "criteria_done" };
  }
  if (input.searchCount >= input.maxSearches) {
    return { type: "max_searches" };
  }
  const gap = input.criteria[input.choice];
  if (gap === undefined) {
    return {
      type: "run_error",
      message: `unknown hop choice: ${input.choice}`,
    };
  }
  return { type: "search_more", gap };
}

export function decideQuery(input: {
  query: string;
  previousQueries: readonly string[];
}): HopStop | { type: "search"; normalized: string } {
  const normalized = normalizeSearchQuery(input.query);
  if (normalized.length === 0) {
    return { type: "invalid_query" };
  }
  const previous = new Set(input.previousQueries.map(normalizeSearchQuery));
  if (previous.has(normalized)) {
    return { type: "no_progress", cause: "repeated_query" };
  }
  return { type: "search", normalized };
}

export async function runHopLoop<T extends HopDocument>(input: {
  initialQuery: string;
  initialDocuments: readonly T[];
  criteria: Record<string, string>;
  maxSearches: number;
  choose: (documents: readonly T[]) => Promise<{ choice: string }>;
  rewrite: (documents: readonly T[], gap: string) => Promise<string>;
  search: (query: string) => Promise<readonly T[]>;
  embed: (query: string) => Promise<void>;
}): Promise<{
  stopReason: HopStop["type"];
  cause?: string;
  searches: number;
  documents: T[];
  rewriteCalls: number;
  embedCalls: number;
}> {
  const documents = [...input.initialDocuments];
  const seen = new Set(documents.map((item) => item.id));
  const previousQueries = [input.initialQuery];
  let searches = 1;
  let rewriteCalls = 0;
  let embedCalls = 0;
  while (true) {
    const decision = await input.choose(documents);
    const next = decideAfterChoice({
      choice: decision.choice,
      criteria: input.criteria,
      searchCount: searches,
      maxSearches: input.maxSearches,
    });
    if (next.type !== "search_more") {
      return {
        stopReason: next.type,
        searches,
        documents,
        rewriteCalls,
        embedCalls,
      };
    }
    rewriteCalls += 1;
    const query = await input.rewrite(documents, next.gap);
    const planned = decideQuery({ query, previousQueries });
    if (planned.type !== "search") {
      return {
        stopReason: planned.type,
        cause: planned.type === "no_progress" ? planned.cause : undefined,
        searches,
        documents,
        rewriteCalls,
        embedCalls,
      };
    }
    embedCalls += 1;
    await input.embed(planned.normalized);
    const found = await input.search(planned.normalized);
    const fresh = found.filter((item) => !seen.has(item.id));
    for (const item of fresh) {
      seen.add(item.id);
      documents.push(item);
    }
    previousQueries.push(planned.normalized);
    searches += 1;
    if (fresh.length === 0) {
      return {
        stopReason: "no_progress",
        cause: "no_new_ids",
        searches,
        documents,
        rewriteCalls,
        embedCalls,
      };
    }
  }
}
