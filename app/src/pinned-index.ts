import {
  findCollection,
  getOrCreateCollection,
  listDocuments,
  upsertChunks,
} from "./chroma.ts";
import {
  collectionNameFor,
  corpusDirectory,
  embeddingModelsCompatible,
  hashCorpus,
  type IndexManifest,
  idDiff,
  plannedFingerprint,
  readCorpusFiles,
  readManifest,
  SPLIT_VERSION,
  sha256,
  writeManifest,
} from "./corpus.ts";
import { field } from "./http.ts";
import { type Chunk, loadChunks } from "./manual.ts";
import { EMBEDDING_DIMENSIONS, EMBEDDING_MODEL } from "./models.ts";
import { embedTexts } from "./openrouter.ts";

export type PinnedCorpus = {
  name: string;
  corpusHash: string;
  fingerprint: string;
  collection: string;
  chunks: Chunk[];
};

export async function loadPinned(name: string): Promise<PinnedCorpus> {
  const directory = corpusDirectory(name);
  const files = await readCorpusFiles(directory);
  if (files.length === 0) {
    throw new Error(`corpus has no markdown: ${name}`);
  }
  const corpusHash = hashCorpus(files);
  const fingerprint = plannedFingerprint(corpusHash);
  const chunks = await loadChunks(directory);
  const ids = chunks.map((chunk) => chunk.id);
  if (new Set(ids).size !== ids.length) {
    throw new Error("duplicate chunk ids");
  }
  return {
    name,
    corpusHash,
    fingerprint,
    collection: collectionNameFor(fingerprint),
    chunks,
  };
}

export async function indexCorpus(name: string): Promise<number> {
  const pinned = await loadPinned(name);
  const embedded = await embedTexts(pinned.chunks.map((chunk) => chunk.body));
  const dimensions = embedded.vectors[0]?.length ?? 0;
  field("corpus", name);
  field("corpus_hash", pinned.corpusHash);
  field("fingerprint", pinned.fingerprint);
  field("collection", pinned.collection);
  field("requested_model", EMBEDDING_MODEL);
  field("response_model", embedded.model);
  field("dimensions", dimensions);
  if (!embeddingModelsCompatible(EMBEDDING_MODEL, embedded.model)) {
    console.error(
      `embedding model is not compatible: ${EMBEDDING_MODEL} / ${embedded.model}`,
    );
    return 1;
  }
  if (dimensions !== EMBEDDING_DIMENSIONS) {
    console.error(
      `expected ${EMBEDDING_DIMENSIONS} dimensions, got ${dimensions}`,
    );
    return 1;
  }
  const collection = await getOrCreateCollection(pinned.collection);
  if (collection.space !== "cosine") {
    console.error(`chroma space is ${collection.space}`);
    return 1;
  }
  await upsertChunks(
    collection.id,
    pinned.chunks.map((chunk, index) => ({
      id: chunk.id,
      body: chunk.body,
      embedding: embedded.vectors[index] ?? [],
      metadata: {
        heading: chunk.heading,
        category: chunk.category,
        source: chunk.source,
        title: chunk.title,
      },
    })),
  );
  const stored = await listDocuments(collection.id);
  const problems = compareStored(pinned.chunks, stored);
  if (problems.length > 0) {
    for (const problem of problems) {
      console.error(problem);
    }
    return 1;
  }
  const bodyHashes: Record<string, string> = {};
  for (const chunk of pinned.chunks) {
    bodyHashes[chunk.id] = sha256(chunk.body);
  }
  const manifest: IndexManifest = {
    corpus: name,
    corpusHash: pinned.corpusHash,
    splitVersion: SPLIT_VERSION,
    requestedModel: EMBEDDING_MODEL,
    responseModel: embedded.model,
    dimensions,
    space: collection.space,
    expectedIds: pinned.chunks.map((chunk) => chunk.id),
    count: stored.length,
    createdAt: new Date().toISOString(),
    collection: pinned.collection,
    fingerprint: pinned.fingerprint,
    bodyHashes,
  };
  await writeManifest(manifest);
  field("verify_index", "ok");
  field("count", stored.length);
  return 0;
}

export async function verifyIndex(name: string): Promise<number> {
  const pinned = await loadPinned(name);
  field("corpus", name);
  field("corpus_hash", pinned.corpusHash);
  field("fingerprint", pinned.fingerprint);
  const manifest = await readManifest(name, pinned.fingerprint);
  if (manifest === undefined) {
    console.error(`manifest missing for ${name}`);
    return 1;
  }
  const problems = manifestProblems(manifest, pinned);
  const collection = await findCollection(manifest.collection);
  if (collection === undefined) {
    problems.push(`collection missing: ${manifest.collection}`);
  } else if (collection.space.length > 0 && collection.space !== "cosine") {
    problems.push(`chroma space is ${collection.space}`);
  }
  if (collection !== undefined) {
    const stored = await listDocuments(collection.id);
    problems.push(...compareStored(pinned.chunks, stored));
  }
  if (problems.length > 0) {
    for (const problem of problems) {
      console.error(problem);
    }
    return 1;
  }
  field("verify_index", "ok");
  field("count", pinned.chunks.length);
  return 0;
}

export async function openPinnedCollection(name: string): Promise<{
  id: string;
  space: string;
  pinned: PinnedCorpus;
}> {
  const pinned = await loadPinned(name);
  const manifest = await readManifest(name, pinned.fingerprint);
  if (manifest === undefined) {
    throw new Error(
      `index is not ready for ${name}. Run index --corpus ${name}`,
    );
  }
  const problems = manifestProblems(manifest, pinned);
  if (problems.length > 0) {
    throw new Error(problems.join("; "));
  }
  const collection = await findCollection(manifest.collection);
  if (collection === undefined) {
    throw new Error(`collection missing: ${manifest.collection}`);
  }
  const stored = await listDocuments(collection.id);
  if (stored.length !== pinned.chunks.length) {
    throw new Error(
      `index count ${stored.length} did not match ${pinned.chunks.length}`,
    );
  }
  return { id: collection.id, space: collection.space, pinned };
}

function compareStored(
  chunks: readonly Chunk[],
  stored: readonly { id: string; document: string }[],
): string[] {
  const diff = idDiff(
    stored.map((item) => item.id),
    chunks.map((chunk) => chunk.id),
  );
  const problems = [
    ...diff.missing.map((id) => `missing id: ${id}`),
    ...diff.unexpected.map((id) => `unexpected id: ${id}`),
  ];
  const byId = new Map(stored.map((item) => [item.id, item.document]));
  for (const chunk of chunks) {
    const document = byId.get(chunk.id);
    if (document !== undefined && document !== chunk.body) {
      problems.push(`body mismatch: ${chunk.id}`);
    }
  }
  if (stored.length !== chunks.length && diff.missing.length === 0) {
    problems.push(`count ${stored.length} did not match ${chunks.length}`);
  }
  return problems;
}

function manifestProblems(
  manifest: IndexManifest,
  pinned: PinnedCorpus,
): string[] {
  const problems: string[] = [];
  if (manifest.corpusHash !== pinned.corpusHash) {
    problems.push("corpus hash mismatch");
  }
  if (manifest.splitVersion !== SPLIT_VERSION) {
    problems.push("split version mismatch");
  }
  if (!embeddingModelsCompatible(manifest.requestedModel, EMBEDDING_MODEL)) {
    problems.push("requested embedding model mismatch");
  }
  if (
    !embeddingModelsCompatible(manifest.requestedModel, manifest.responseModel)
  ) {
    problems.push("response embedding model mismatch");
  }
  if (manifest.dimensions !== EMBEDDING_DIMENSIONS) {
    problems.push("embedding dimensions mismatch");
  }
  if (manifest.space !== "cosine") {
    problems.push("distance space mismatch");
  }
  if (manifest.collection !== pinned.collection) {
    problems.push("collection name mismatch");
  }
  const diff = idDiff(
    manifest.expectedIds,
    pinned.chunks.map((chunk) => chunk.id),
  );
  for (const id of diff.missing) {
    problems.push(`manifest missing id: ${id}`);
  }
  for (const id of diff.unexpected) {
    problems.push(`manifest unexpected id: ${id}`);
  }
  return problems;
}
