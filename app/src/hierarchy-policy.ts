export type ScoredItem = {
  name: string;
  score: number;
};

export function keepByScore<T extends ScoredItem>(
  items: readonly T[],
  minScore: number,
  fallback: "top1" | "top2",
): T[] {
  const passed = items.filter((item) => item.score >= minScore);
  if (passed.length > 0) {
    return [...passed];
  }
  const ranked = items
    .map((item, index) => ({ item, index }))
    .sort((left, right) => {
      if (right.item.score !== left.item.score) {
        return right.item.score - left.item.score;
      }
      return left.index - right.index;
    });
  const count = fallback === "top1" ? 1 : Math.min(2, ranked.length);
  return ranked.slice(0, count).map((entry) => entry.item);
}
