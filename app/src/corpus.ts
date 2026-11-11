import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EMBEDDING_DIMENSIONS, EMBEDDING_MODEL } from "./models.ts";

export const SPLIT_VERSION = "heading-v1";
export const INDEX_SPACE = "cosine";

export type CorpusFile = {
  path: string;
  text: string;
};

export type IndexManifest = {
  corpus: string;
  corpusHash: string;
  splitVersion: string;
  requestedModel: string;
  responseModel: string;
  dimensions: number;
  space: string;
  expectedIds: string[];
  count: number;
  createdAt: string;
  collection: string;
  fingerprint: string;
  bodyHashes: Record<string, string>;
};

export function normalizeNewlines(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

export function sha256(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

// Hash of sorted relative paths and newline-normalized file contents.
// Each record is path, NUL, content, NUL. CRLF and CR are LF before hashing.
export function hashCorpus(files: readonly CorpusFile[]): string {
  const sorted = [...files].sort((left, right) =>
    left.path < right.path ? -1 : left.path > right.path ? 1 : 0,
  );
  const parts: Buffer[] = [];
  for (const file of sorted) {
    parts.push(Buffer.from(file.path, "utf8"));
    parts.push(Buffer.from([0]));
    parts.push(Buffer.from(normalizeNewlines(file.text), "utf8"));
    parts.push(Buffer.from([0]));
  }
  return sha256(Buffer.concat(parts));
}

export function embeddingModelKey(name: string): string {
  const trimmed = name.trim().toLowerCase();
  const slash = trimmed.lastIndexOf("/");
  return slash === -1 ? trimmed : trimmed.slice(slash + 1);
}

export function embeddingModelsCompatible(
  requested: string,
  response: string,
): boolean {
  return embeddingModelKey(requested) === embeddingModelKey(response);
}

export function indexFingerprint(input: {
  corpusHash: string;
  splitVersion: string;
  requestedModel: string;
  dimensions: number;
  space: string;
}): string {
  return sha256(
    [
      input.corpusHash,
      input.splitVersion,
      embeddingModelKey(input.requestedModel),
      String(input.dimensions),
      input.space,
    ].join("\n"),
  );
}

export function collectionNameFor(fingerprint: string): string {
  return `tf${fingerprint.slice(0, 20)}`;
}

export function idDiff(
  stored: readonly string[],
  expected: readonly string[],
): { missing: string[]; unexpected: string[] } {
  const expectedSet = new Set(expected);
  const storedSet = new Set(stored);
  return {
    missing: expected.filter((id) => !storedSet.has(id)),
    unexpected: stored.filter((id) => !expectedSet.has(id)),
  };
}

export function upsertBodies(
  store: ReadonlyMap<string, string>,
  records: readonly { id: string; body: string }[],
): Map<string, string> {
  const next = new Map(store);
  for (const record of records) {
    next.set(record.id, record.body);
  }
  return next;
}

export function addTokens(
  left: number | null,
  right: number | null,
): number | null {
  if (left === null || right === null) {
    return null;
  }
  return left + right;
}

export function repoRoot(): string {
  return fileURLToPath(new URL("../../", import.meta.url));
}

export function fixturesRoot(): string {
  return path.join(repoRoot(), "fixtures", "manuals");
}

export function artifactsDir(): string {
  const configured = process.env.ARTIFACTS_DIR ?? "";
  if (configured.length > 0) {
    return configured;
  }
  return path.join(repoRoot(), "artifacts");
}

export function corpusDirectory(name: string): string {
  if (!/^[a-z0-9-]+$/.test(name)) {
    throw new Error(`invalid corpus name: ${name}`);
  }
  return path.join(fixturesRoot(), name);
}

export async function readCorpusFiles(
  directory: string,
): Promise<CorpusFile[]> {
  const names = (await readdir(directory))
    .filter((name) => name.endsWith(".md"))
    .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
  const files: CorpusFile[] = [];
  for (const name of names) {
    files.push({
      path: name,
      text: await readFile(path.join(directory, name), "utf8"),
    });
  }
  return files;
}

export function manifestPath(corpus: string, fingerprint: string): string {
  return path.join(artifactsDir(), "indexes", corpus, `${fingerprint}.json`);
}

export async function writeManifest(manifest: IndexManifest): Promise<void> {
  const file = manifestPath(manifest.corpus, manifest.fingerprint);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

export async function readManifest(
  corpus: string,
  fingerprint: string,
): Promise<IndexManifest | undefined> {
  try {
    const text = await readFile(manifestPath(corpus, fingerprint), "utf8");
    return JSON.parse(text) as IndexManifest;
  } catch (error) {
    if (isMissingFile(error)) {
      return undefined;
    }
    throw error;
  }
}

export function plannedFingerprint(corpusHash: string): string {
  return indexFingerprint({
    corpusHash,
    splitVersion: SPLIT_VERSION,
    requestedModel: EMBEDDING_MODEL,
    dimensions: EMBEDDING_DIMENSIONS,
    space: INDEX_SPACE,
  });
}

function isMissingFile(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}
