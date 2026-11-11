import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const script = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "check-book.mjs",
);

test("a book with a missing chapter slug fails", () => {
  const root = tempBook({
    chapters: ["introduction", "01-missing"],
    files: { "introduction.md": chapter("はじめに") },
  });
  const result = spawnSync(process.execPath, [script, root], {
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /01-missing/);
});

test("invalid json in a chapter fails", () => {
  const root = tempBook({
    chapters: ["introduction"],
    files: {
      "introduction.md": `${chapter("はじめに")}

\`\`\`json
{ "a":
\`\`\`
`,
    },
  });
  const result = spawnSync(process.execPath, [script, root], {
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /invalid json/);
});

test("a complete book passes, including a mermaid colon fence", () => {
  const root = tempBook({
    chapters: ["introduction"],
    files: {
      "introduction.md": `${chapter("はじめに")}

\`\`\`mermaid:
flowchart LR
  A --> B
\`\`\`

\`\`\`json
{ "ok": true }
\`\`\`
`,
    },
  });
  const result = spawnSync(process.execPath, [script, root], {
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
});

function tempBook(input) {
  const root = mkdtempSync(path.join(tmpdir(), "book-"));
  mkdirSync(root, { recursive: true });
  writeFileSync(
    path.join(root, "config.yaml"),
    `title: "fixture"\nchapters:\n${input.chapters
      .map((slug) => `  - ${slug}`)
      .join("\n")}\n`,
  );
  writeFileSync(
    path.join(root, "chapter-policy.json"),
    JSON.stringify({ excluded: {} }),
  );
  for (const [name, text] of Object.entries(input.files)) {
    writeFileSync(path.join(root, name), text);
  }
  return root;
}

function chapter(title) {
  return `---\ntitle: "${title}"\n---\n\n## ${title}\n`;
}
