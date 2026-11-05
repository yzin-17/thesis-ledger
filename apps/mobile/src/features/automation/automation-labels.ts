export const automationTypeLabels: Record<string, string> = {
  'market-sync': '市场数据同步',
  'risk-evaluation': '风险评估',
  'daily-digest': '每日摘要',
  'valuation-intraday-sample': '盘中估值采样',
  'snapshot-close-estimate': '盘后估值预估',
  'snapshot-official-reconcile': '正式净值校准',
  backup: '数据备份',
  'provider-health': '来源健康检查',
  'cash-deposit-materialization': '定期入账生成',
  'fund-investment-materialization': '基金定投待确认生成',
};
export const automationTypeLabel = (value: string) =>
  automationTypeLabels[value] ?? `其他（${value}）`;
const statusLabels: Record<string, string> = {
  queued: '等待运行',
  running: '运行中',
  succeeded: '成功',
  failed: '失败',
  unknown_outcome: '结果待确认',
};
export const automationStatusLabel = (value: string) => statusLabels[value] ?? `其他（${value}）`;
