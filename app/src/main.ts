import { runCheck } from "./check.ts";
import {
  runAnswer,
  runCompare,
  runDescend,
  runEmbed,
  runExclude,
  runFilter,
  runHop,
  runHopFacts,
  runIndex,
  runRelate,
  runRerank,
  runRetry,
  runRoute,
  runSearch,
  runSplit,
  runVerify,
} from "./commands.ts";
import { runVerifyFixture } from "./verify-fixture.ts";

async function main(): Promise<number> {
  const [command = "check", ...args] = process.argv.slice(2);
  if (command === "check") {
    return runCheck();
  }
  if (command === "split") {
    await runSplit();
    return 0;
  }
  if (command === "embed") {
    await runEmbed();
    return 0;
  }
  if (command === "index") {
    await runIndex();
    return 0;
  }
  if (command === "search") {
    await runSearch(
      option(args, "--question") ?? "データはいつ削除される？",
      numberOption(args, "--limit", 3),
      option(args, "--category"),
    );
    return 0;
  }
  if (command === "answer") {
    await runAnswer(option(args, "--question") ?? "");
    return 0;
  }
  if (command === "exclude") {
    await runExclude();
    return 0;
  }
  if (command === "filter") {
    await runFilter();
    return 0;
  }
  if (command === "route") {
    await runRoute();
    return 0;
  }
  if (command === "retry") {
    await runRetry();
    return 0;
  }
  if (command === "compare") {
    await runCompare();
    return 0;
  }
  if (command === "relate") {
    await runRelate();
    return 0;
  }
  if (command === "hop") {
    await runHop();
    return 0;
  }
  if (command === "hop-facts") {
    await runHopFacts();
    return 0;
  }
  if (command === "descend") {
    await runDescend();
    return 0;
  }
  if (command === "verify") {
    await runVerify();
    return 0;
  }
  if (command === "verify-fixture") {
    await runVerifyFixture();
    return 0;
  }
  if (command === "rerank") {
    await runRerank();
    return 0;
  }
  console.error(
    "commands: check, split, embed, index, search, answer, filter, rerank, exclude, route, retry, verify, verify-fixture, descend, hop, hop-facts, relate, compare",
  );
  return 1;
}

function option(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index === -1) {
    return undefined;
  }
  return args[index + 1];
}

function numberOption(args: string[], name: string, fallback: number): number {
  const value = option(args, name);
  if (value === undefined) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "failed");
    process.exitCode = 1;
  });
