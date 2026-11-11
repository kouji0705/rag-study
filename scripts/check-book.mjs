import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const bookDir = path.resolve(process.argv[2] ?? "books/cd019af39edb03");
const errors = [];

const config = readFileSync(path.join(bookDir, "config.yaml"), "utf8");
const slugs = chapterSlugs(config);
const seen = new Set();
for (const slug of slugs) {
  if (seen.has(slug)) {
    errors.push(`duplicate slug: ${slug}`);
  }
  seen.add(slug);
  const file = path.join(bookDir, `${slug}.md`);
  let text = "";
  try {
    text = readFileSync(file, "utf8");
  } catch {
    errors.push(`missing chapter file: ${slug}`);
    continue;
  }
  if (titleOf(text) === null) {
    errors.push(`missing title: ${slug}`);
  }
  errors.push(...markdownProblems(slug, text, new Set(slugs)));
}

const policy = readPolicy(bookDir);
const markdownNames = readdirSync(bookDir).filter((name) =>
  name.endsWith(".md"),
);
for (const name of markdownNames) {
  const slug = name.slice(0, -3);
  if (seen.has(slug) || Object.hasOwn(policy, slug)) {
    continue;
  }
  errors.push(`unlisted manuscript: ${slug}`);
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(error);
  }
  process.exit(1);
}

function chapterSlugs(text) {
  const slugs = [];
  let inChapters = false;
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith("chapters:")) {
      inChapters = true;
      continue;
    }
    if (!inChapters) {
      continue;
    }
    const item = /^\s+-\s+(\S+)\s*$/.exec(line);
    if (item?.[1] !== undefined) {
      slugs.push(item[1]);
      continue;
    }
    if (/^\S/.test(line)) {
      inChapters = false;
    }
  }
  return slugs;
}

function titleOf(text) {
  if (!text.startsWith("---\n") && !text.startsWith("---\r\n")) {
    return null;
  }
  const end = text.indexOf("\n---", 3);
  if (end === -1) {
    return null;
  }
  const match = /^title:\s*(.+)\s*$/m.exec(text.slice(0, end));
  if (match?.[1] === undefined) {
    return null;
  }
  const title = match[1].trim().replace(/^["']|["']$/g, "");
  return title.length > 0 ? title : null;
}

function markdownProblems(slug, text, published) {
  const problems = [];
  const lines = text.split(/\r?\n/);
  let fence = null;
  const fences = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (!line.startsWith("```")) {
      if (fence !== null) {
        fence.body.push(line);
      }
      continue;
    }
    if (fence === null) {
      fence = { info: line.slice(3).trim(), start: index, body: [] };
      continue;
    }
    fences.push({ ...fence, body: fence.body.join("\n") });
    fence = null;
  }
  if (fence !== null) {
    problems.push(`unclosed fence: ${slug}`);
  }
  for (const block of fences) {
    if (block.info === "json") {
      try {
        JSON.parse(block.body);
      } catch {
        problems.push(`invalid json: ${slug}`);
      }
    }
  }
  const details = text.match(/<details\b/g)?.length ?? 0;
  const closed = text.match(/<\/details>/g)?.length ?? 0;
  if (details !== closed) {
    problems.push(`unclosed details: ${slug}`);
  }
  for (const match of text.matchAll(
    /!\[[^\]]*\]\([^)]+\)|\[[^\]]*\]\(([^)]+)\)/g,
  )) {
    const target = match[1];
    if (target === undefined || /^https?:|^mailto:/.test(target)) {
      continue;
    }
    if (!target.startsWith("./")) {
      continue;
    }
    const linked = target.replace(/^\.\//, "").split(/[?#]/)[0] ?? "";
    const chapter = linked.replace(/\.md$/, "");
    if (!published.has(chapter)) {
      problems.push(`broken chapter link: ${slug} -> ${target}`);
    }
  }
  return problems;
}

function readPolicy(directory) {
  try {
    const payload = JSON.parse(
      readFileSync(path.join(directory, "chapter-policy.json"), "utf8"),
    );
    if (payload !== null && typeof payload.excluded === "object") {
      return payload.excluded;
    }
  } catch {
    return {};
  }
  return {};
}
