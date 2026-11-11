export function topStarts(
  ranked: readonly { name: string; similarity: number }[],
  count: number,
): string[] {
  return [...ranked]
    .sort((left, right) => {
      if (right.similarity !== left.similarity) {
        return right.similarity - left.similarity;
      }
      return left.name < right.name ? -1 : left.name > right.name ? 1 : 0;
    })
    .slice(0, count)
    .map((item) => item.name);
}

export function graphUserText(input: {
  question: string;
  passages: string;
  relations: string | null;
}): string {
  if (input.relations === null) {
    return `質問:\n${input.question}\n\n文書:\n${input.passages}`;
  }
  return `質問:\n${input.question}\n\n関係:\n${input.relations}\n\n文書:\n${input.passages}`;
}

export function limitPassages<T>(
  items: readonly T[],
  limit: number,
): { kept: T[]; omitted: number } {
  return {
    kept: items.slice(0, limit),
    omitted: Math.max(0, items.length - limit),
  };
}
