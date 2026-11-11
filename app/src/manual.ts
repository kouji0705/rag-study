import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type Chunk = {
  id: string;
  source: string;
  title: string;
  heading: string;
  category: string;
  body: string;
};

const REQUIRED_HEADINGS = [
  "退会後の請求",
  "退会後のデータ削除",
  "プラン変更時の日割り",
  "日割り請求のルール",
  "請求日",
];

export function manualDir(): string {
  const configured = process.env.MANUAL_DIR ?? "";
  if (configured.length > 0) {
    return configured;
  }
  return fileURLToPath(new URL("../../manual", import.meta.url));
}

export async function loadChunks(directory = manualDir()): Promise<Chunk[]> {
  const files = (await readdir(directory))
    .filter((name) => name.endsWith(".md"))
    .sort();
  const chunks = (
    await Promise.all(
      files.map(async (name) =>
        splitMarkdown(name, await readFile(path.join(directory, name), "utf8")),
      ),
    )
  ).flat();

  if (chunks.length < 10) {
    throw new Error(`expected at least 10 chunks, got ${chunks.length}`);
  }
  for (const heading of REQUIRED_HEADINGS) {
    if (!chunks.some((chunk) => chunk.heading === heading)) {
      throw new Error(`missing heading: ${heading}`);
    }
  }
  return chunks;
}

export function splitMarkdown(filename: string, markdown: string): Chunk[] {
  const lines = markdown.split(/\r?\n/);
  let title = "";
  let heading = "";
  let buffer: string[] = [];
  const sections: { heading: string; text: string }[] = [];

  const flush = (): void => {
    const text = buffer.join("\n").trim();
    if (heading.length > 0 && text.length > 0) {
      sections.push({ heading, text });
    }
    buffer = [];
  };

  for (const line of lines) {
    const match = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
    if (!match) {
      buffer.push(line);
      continue;
    }
    const level = match[1].length;
    const label = match[2];
    if (level === 1) {
      flush();
      title = label;
      heading = "";
      continue;
    }
    flush();
    heading = label;
  }
  flush();

  if (title.length === 0) {
    throw new Error(`${filename} has no title`);
  }

  return sections.map((section) => ({
    id: `${filename}#${section.heading}`,
    source: filename,
    title,
    heading: section.heading,
    category: title,
    body: `${title}\n${section.heading}\n${section.text}`,
  }));
}
