export type Relation = {
  from: string;
  relation: string;
  to: string;
  sourceId: string;
};

export const RELATIONS: readonly Relation[] = [
  {
    from: "SSO",
    relation: "対応する",
    to: "Proプラン",
    sourceId: "billing.md#SSO",
  },
  {
    from: "Proプラン",
    relation: "月額",
    to: "12000円（税別）",
    sourceId: "billing.md#Proプランの月額",
  },
  {
    from: "Standardプラン",
    relation: "月額",
    to: "980円",
    sourceId: "billing.md#Standardプランの月額",
  },
  {
    from: "契約開始",
    relation: "計算",
    to: "開始日から月末までの日割り",
    sourceId: "billing.md#日割り請求のルール",
  },
  {
    from: "上位プランへの変更",
    relation: "計算",
    to: "変更日から月末までの日割り",
    sourceId: "billing.md#プラン変更時の日割り",
  },
  {
    from: "解約した月",
    relation: "料金",
    to: "満額",
    sourceId: "withdrawal.md#退会後の請求",
  },
  {
    from: "退会完了",
    relation: "削除",
    to: "30日後",
    sourceId: "withdrawal.md#退会後のデータ削除",
  },
  {
    from: "決済失敗から14日",
    relation: "状態",
    to: "読み取り専用",
    sourceId: "billing.md#支払いの失敗",
  },
];

export const GRAPH_DEMO_QUESTION = "SSOが使えるプランの月額はいくらですか？";
export const GRAPH_DEMO_START = "SSO";
export const GRAPH_DEMO_HOPS = 2;

export function walkRelations(
  starts: readonly string[],
  hops: number,
): Relation[] {
  const seenEdges = new Set<string>();
  const seenNodes = new Set(starts);
  const collected: Relation[] = [];
  let frontier = [...starts];
  for (let step = 0; step < hops; step += 1) {
    const next: string[] = [];
    for (const node of frontier) {
      for (const edge of RELATIONS) {
        if (edge.from !== node && edge.to !== node) {
          continue;
        }
        const key = `${edge.from}|${edge.relation}|${edge.to}|${edge.sourceId}`;
        if (!seenEdges.has(key)) {
          seenEdges.add(key);
          collected.push(edge);
        }
        const other = edge.from === node ? edge.to : edge.from;
        if (!seenNodes.has(other)) {
          seenNodes.add(other);
          next.push(other);
        }
      }
    }
    frontier = next;
  }
  return collected;
}
