export function strategyCapabilityGapLines(gap: {
  originalRule: string;
  reason: string;
  gaps: readonly {
    path: string;
    kind: 'expression' | 'data' | 'execution' | 'scope';
    detail: string;
  }[];
  supportedParts: readonly string[];
}): string[] {
  const labels = { expression: '表达能力', data: '数据', execution: '执行能力', scope: '探索范围' };
  return [
    `原规则：${gap.originalRule}`,
    `当前限制：${gap.reason}`,
    ...gap.gaps.map((item) => `${labels[item.kind]} · ${item.path}：${item.detail}`),
    ...(gap.supportedParts.length ? [`已能表达：${gap.supportedParts.join('；')}`] : []),
  ];
}
