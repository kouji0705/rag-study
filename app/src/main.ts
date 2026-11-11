import { runCheck } from "./check.ts";
import {
  loadRetrieved,
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
import { runEval } from "./eval-run.ts";
import { completeAnswer } from "./openrouter.ts";
import { verifyIndex } from "./pinned-index.ts";
import type {
  CriteriaMode,
  FallbackMode,
  HopCriteriaMode,
  LevelInstructions,
  RunOptions,
  StopMode,
} from "./run-options.ts";
import { runVerifyFixture } from "./verify-fixture.ts";

async function main(): Promise<number> {
  const [command = "check", ...args] = process.argv.slice(2);
  const options = runOptions(args);
  if (command === "check") {
    return runCheck();
  }
  if (command === "split") {
    await runSplit(options);
    return 0;
  }
  if (command === "embed") {
    await runEmbed(options);
    return 0;
  }
  if (command === "index") {
    return runIndex(options);
  }
  if (command === "verify-index") {
    if (options.corpus === undefined) {
      console.error("verify-index requires --corpus");
      return 1;
    }
    return verifyIndex(options.corpus);
  }
  if (command === "search") {
    await runSearch(
      option(args, "--question") ?? "データはいつ削除される？",
      numberOption(args, "--limit", 3),
      option(args, "--category"),
      options,
    );
    return 0;
  }
  if (command === "answer") {
    await runAnswer(option(args, "--question") ?? "", options);
    return 0;
  }
  if (command === "exclude") {
    await runExclude(options);
    return 0;
  }
  if (command === "filter") {
    await runFilter(options);
    return 0;
  }
  if (command === "route") {
    await runRoute(options);
    return 0;
  }
  if (command === "retry") {
    await runRetry(options);
    return 0;
  }
  if (command === "compare") {
    await runCompare(options);
    return 0;
  }
  if (command === "relate") {
    await runRelate(options);
    return 0;
  }
  if (command === "hop") {
    await runHop(options);
    return 0;
  }
  if (command === "hop-facts") {
    await runHopFacts(options);
    return 0;
  }
  if (command === "descend") {
    await runDescend(options);
    return 0;
  }
  if (command === "verify") {
    await runVerify(options);
    return 0;
  }
  if (command === "verify-fixture") {
    await runVerifyFixture();
    return 0;
  }
  if (command === "rerank") {
    await runRerank(options);
    return 0;
  }
  if (command === "eval") {
    return runEvalCommand(args, options);
  }
  console.error(
    "commands: check, split, embed, index, verify-index, search, answer, filter, rerank, exclude, route, retry, verify, verify-fixture, descend, hop, hop-facts, relate, compare, eval",
  );
  return 1;
}

async function runEvalCommand(
  args: string[],
  options: RunOptions,
): Promise<number> {
  const mode = option(args, "--mode") ?? "dry-run";
  const cases = (option(args, "--cases") ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  const methods = (option(args, "--methods") ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  return runEval({
    suite: option(args, "--suite") ?? "core",
    corpus: options.corpus,
    mode,
    repeats: numberOption(args, "--repeats", 1),
    cases,
    methods,
    runId: option(args, "--run"),
    documentsFor:
      mode === "live"
        ? async (evalCase) => {
            if (options.corpus === undefined) {
              throw new Error("live eval requires --corpus");
            }
            return loadRetrieved(evalCase.question, options, 3);
          }
        : undefined,
    answer:
      mode === "live"
        ? async (user) => {
            const answer = await completeAnswer(user);
            return {
              text: answer.text,
              model: answer.model,
              inputTokens: answer.inputTokens,
              outputTokens: answer.outputTokens,
            };
          }
        : undefined,
  });
}

function runOptions(args: string[]): RunOptions {
  return {
    corpus: option(args, "--corpus"),
    question: option(args, "--question"),
    criteria: choice<CriteriaMode>(args, "--criteria", [
      "specialized",
      "generic",
      "both",
    ]),
    thresholds: thresholds(args),
    fallback: choice<FallbackMode>(args, "--fallback", ["top1", "top2"]),
    stop: choice<StopMode>(args, "--stop", ["legacy", "progress"]),
    hopCriteria: choice<HopCriteriaMode>(args, "--hop-criteria", [
      "a",
      "b",
      "c",
      "facts",
    ]),
    levelInstructions: choice<LevelInstructions>(args, "--level-instructions", [
      "document",
      "parent",
    ]),
  };
}

function option(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index === -1) {
    return undefined;
  }
  return args[index + 1];
}

function choice<T extends string>(
  args: string[],
  name: string,
  allowed: readonly T[],
): T | undefined {
  const value = option(args, name);
  if (value === undefined) {
    return undefined;
  }
  if (!allowed.includes(value as T)) {
    throw new Error(`${name} must be ${allowed.join(", ")}`);
  }
  return value as T;
}

function thresholds(args: string[]): number[] | undefined {
  const value = option(args, "--thresholds");
  if (value === undefined) {
    return undefined;
  }
  const parsed = value.split(",").map((item) => Number(item));
  if (parsed.some((item) => !Number.isInteger(item) || item < 0)) {
    throw new Error("--thresholds must be comma-separated integers");
  }
  return parsed;
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
