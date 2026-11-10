import type { Chunk } from "./manual.ts";

export type ManualGroup = {
  category: string;
  group: string;
  headings: readonly string[];
};

export const MANUAL_GROUPS: readonly ManualGroup[] = [
  {
    category: "アカウント",
    group: "認証",
    headings: ["ログイン", "パスワードの再設定"],
  },
  { category: "請求", group: "請求時期", headings: ["請求日"] },
  {
    category: "請求",
    group: "日割り",
    headings: ["日割り請求のルール", "プラン変更時の日割り"],
  },
  {
    category: "請求",
    group: "プラン",
    headings: [
      "Standardプランの月額",
      "Proプランの月額",
      "SSO",
      "プランの種類",
    ],
  },
  {
    category: "請求",
    group: "支払い",
    headings: ["支払い方法", "支払いの失敗", "領収書"],
  },
  {
    category: "退会",
    group: "手続き",
    headings: ["退会できる人", "退会の手続き", "解約の取り消し"],
  },
  {
    category: "退会",
    group: "退会後",
    headings: ["退会後の請求", "退会後のデータ削除", "退会前の書き出し"],
  },
];

export type PlacedChunk = {
  chunk: Chunk;
  category: string;
  group: string;
};

export function placeChunks(chunks: Chunk[]): PlacedChunk[] {
  const byHeading = new Map(chunks.map((chunk) => [chunk.heading, chunk]));
  const used = new Set<string>();
  const placed: PlacedChunk[] = [];
  for (const group of MANUAL_GROUPS) {
    for (const heading of group.headings) {
      const chunk = byHeading.get(heading);
      if (chunk === undefined) {
        throw new Error(`hierarchy missing heading: ${heading}`);
      }
      if (chunk.category !== group.category) {
        throw new Error(`category mismatch: ${heading}`);
      }
      if (used.has(heading)) {
        throw new Error(`duplicate heading: ${heading}`);
      }
      used.add(heading);
      placed.push({ chunk, category: group.category, group: group.group });
    }
  }
  for (const chunk of chunks) {
    if (!used.has(chunk.heading)) {
      throw new Error(`heading not in hierarchy: ${chunk.heading}`);
    }
  }
  return placed;
}
