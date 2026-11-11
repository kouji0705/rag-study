import { chromaBase, decimal, field, isRecord, postJson } from "./http.ts";
import { COLLECTION_NAME } from "./models.ts";

export type Hit = {
  id: string;
  document: string;
  heading: string;
  category: string;
  distance: number;
};

type Collection = {
  id: string;
  space: string;
};

export async function getOrCreateCollection(
  name = COLLECTION_NAME,
): Promise<Collection> {
  const payload = await postJson(
    chromaBase(),
    {
      name,
      get_or_create: true,
      configuration: { hnsw: { space: "cosine" } },
    },
    {},
  );
  if (!isRecord(payload) || typeof payload.id !== "string") {
    throw new Error("chroma collection id missing");
  }
  const space = readSpace(payload);
  if (space !== "cosine") {
    throw new Error(`chroma space is ${space || "unknown"}`);
  }
  return { id: payload.id, space };
}

export async function upsertChunks(
  collectionId: string,
  records: {
    id: string;
    body: string;
    embedding: number[];
    metadata: Record<string, string>;
  }[],
): Promise<void> {
  await postJson(
    `${chromaBase()}/${collectionId}/upsert`,
    {
      ids: records.map((record) => record.id),
      documents: records.map((record) => record.body),
      embeddings: records.map((record) => record.embedding),
      metadatas: records.map((record) => record.metadata),
    },
    {},
  );
}

export async function countRecords(collectionId: string): Promise<number> {
  const response = await fetch(`${chromaBase()}/${collectionId}/count`);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${response.status} ${text.slice(0, 500)}`);
  }
  const payload = JSON.parse(text) as unknown;
  if (typeof payload !== "number") {
    throw new Error("chroma count was not a number");
  }
  return payload;
}

export async function readDocument(
  collectionId: string,
  id: string,
): Promise<string> {
  const payload = await postJson(
    `${chromaBase()}/${collectionId}/get`,
    { ids: [id], include: ["documents", "metadatas"] },
    {},
  );
  const documents = readStringList(payload, "documents");
  const document = documents[0];
  if (document === undefined) {
    throw new Error(`chroma readback missed ${id}`);
  }
  return document;
}

export async function queryCollection(
  collectionId: string,
  embedding: number[],
  limit: number,
  category?: string,
): Promise<Hit[]> {
  const body: Record<string, unknown> = {
    query_embeddings: [embedding],
    n_results: limit,
    include: ["documents", "metadatas", "distances"],
  };
  if (category !== undefined) {
    body.where = { category };
  }
  const payload = await postJson(
    `${chromaBase()}/${collectionId}/query`,
    body,
    {},
  );
  return readHits(payload);
}

export async function findCollection(
  name: string,
): Promise<Collection | undefined> {
  const response = await fetch(chromaBase());
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${response.status} ${text.slice(0, 500)}`);
  }
  const payload = JSON.parse(text) as unknown;
  const rows = collectionRows(payload);
  const found = rows.find((row) => row.name === name);
  if (found === undefined) {
    return undefined;
  }
  return { id: found.id, space: found.space };
}

export async function listDocuments(
  collectionId: string,
): Promise<{ id: string; document: string }[]> {
  const documents: { id: string; document: string }[] = [];
  const seen = new Set<string>();
  const limit = 100;
  let offset = 0;
  while (true) {
    const payload = await postJson(
      `${chromaBase()}/${collectionId}/get`,
      { include: ["documents"], limit, offset },
      {},
    );
    const page = readGetPage(payload);
    if (page.length === 0) {
      break;
    }
    let added = 0;
    for (const item of page) {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        documents.push(item);
        added += 1;
      }
    }
    if (added === 0 || page.length < limit) {
      break;
    }
    offset += page.length;
  }
  return documents;
}

export function printHit(rank: number, hit: Hit): void {
  field("rank", rank);
  field("id", hit.id);
  field("heading", hit.heading);
  field("category", hit.category);
  field("distance", decimal(hit.distance));
}

function readSpace(payload: Record<string, unknown>): string {
  const configuration = payload.configuration_json ?? payload.configuration;
  if (!isRecord(configuration) || !isRecord(configuration.hnsw)) {
    return "";
  }
  return typeof configuration.hnsw.space === "string"
    ? configuration.hnsw.space
    : "";
}

function readHits(payload: unknown): Hit[] {
  if (!isRecord(payload)) {
    throw new Error("chroma query payload missing");
  }
  const ids = firstRow(payload.ids);
  const documents = firstRow(payload.documents);
  const distances = firstRow(payload.distances);
  const metadatas = firstRow(payload.metadatas);
  return ids.map((id, index) => {
    const metadata = metadatas[index];
    const distance = distances[index];
    const document = documents[index];
    if (
      typeof id !== "string" ||
      typeof document !== "string" ||
      typeof distance !== "number"
    ) {
      throw new Error("chroma query row was incomplete");
    }
    if (
      !isRecord(metadata) ||
      typeof metadata.heading !== "string" ||
      typeof metadata.category !== "string"
    ) {
      throw new Error(`chroma metadata missing for ${id}`);
    }
    return {
      id,
      document,
      heading: metadata.heading,
      category: metadata.category,
      distance,
    };
  });
}

function firstRow(value: unknown): unknown[] {
  if (!Array.isArray(value) || !Array.isArray(value[0])) {
    throw new Error("chroma response row missing");
  }
  return value[0];
}

function collectionRows(
  payload: unknown,
): { id: string; name: string; space: string }[] {
  const rows = Array.isArray(payload)
    ? payload
    : isRecord(payload) && Array.isArray(payload.collections)
      ? payload.collections
      : [];
  return rows.flatMap((row) => {
    if (
      !isRecord(row) ||
      typeof row.id !== "string" ||
      row.name === undefined
    ) {
      return [];
    }
    const name = typeof row.name === "string" ? row.name : "";
    return [{ id: row.id, name, space: readSpace(row) }];
  });
}

function readGetPage(payload: unknown): { id: string; document: string }[] {
  if (!isRecord(payload) || !Array.isArray(payload.ids)) {
    throw new Error("chroma get ids missing");
  }
  const documents = Array.isArray(payload.documents) ? payload.documents : [];
  return payload.ids.flatMap((id, index) => {
    const document = documents[index];
    if (typeof id !== "string" || typeof document !== "string") {
      return [];
    }
    return [{ id, document }];
  });
}

function readStringList(payload: unknown, key: string): string[] {
  if (!isRecord(payload) || !Array.isArray(payload[key])) {
    throw new Error(`chroma ${key} missing`);
  }
  return payload[key].filter(
    (item): item is string => typeof item === "string",
  );
}
