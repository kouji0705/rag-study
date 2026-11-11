export type CriteriaMode = "specialized" | "generic" | "both";
export type FallbackMode = "top1" | "top2";
export type StopMode = "legacy" | "progress";
export type HopCriteriaMode = "a" | "b" | "c" | "facts";
export type LevelInstructions = "document" | "parent";

export type RunOptions = {
  corpus?: string;
  question?: string;
  criteria?: CriteriaMode;
  thresholds?: number[];
  fallback?: FallbackMode;
  stop?: StopMode;
  hopCriteria?: HopCriteriaMode;
  levelInstructions?: LevelInstructions;
};
