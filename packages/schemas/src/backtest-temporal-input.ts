/** 历史计算只能沿一个行情来源的观测推进，不能预计算动态持仓或混用时钟。 */
export function temporalInputIssue(input: unknown): string | undefined {
  const sources = new Set<string>();
  let dynamic = false;
  const visit = (value: unknown): void => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    const node = value as Record<string, unknown>;
    if (['positionState', 'sessionValue', 'corporateActionEvent'].includes(String(node.type)))
      dynamic = true;
    if (node.type === 'series' && typeof node.sourceId === 'string') sources.add(node.sourceId);
    Object.values(node).forEach(visit);
  };
  visit(input);
  if (dynamic) return '历史窗口不能预计算持仓、权益事件或会话数值';
  if (sources.size !== 1) return '历史窗口必须唯一锚定一个行情来源';
  return undefined;
}
