const sourceReasons: Record<string, string> = {
  disabled: '行情获取已关闭',
  not_selected: '尚未选择行情来源',
  not_eligible: '当前来源不可用',
  background_budget_unverified: '当前来源尚未确认后台调用预算',
  identity_unverified: '标的分类尚未核实',
  official_nav_updates_required: '等待正式净值更新，尚未接入自动获取',
  outside_market_session: '当前不在交易时段，等待下次开市',
  calendar_unavailable: '交易日历不可用，暂不能确认交易时段',
  source_request_window: '等待来源请求窗口',
  shared_quote_cache: '使用同范围已有报价',
  sample_observed: '已自动取得报价',
  acquisition_unavailable: '自动获取暂不可用，等待恢复',
};
const sourceNames: Record<string, string> = {
  tencent: '腾讯',
  hithink: '同花顺',
  futu: '富途',
  longbridge: '长桥',
};

export function riskMonitoringRuleIssueLabel(issue: { assetName?: string | undefined; symbol: string | null; ruleLabel: string }) {
  let target = issue.symbol ?? '';
  if (issue.assetName && issue.assetName !== issue.symbol) target = issue.symbol ? `${issue.assetName}（${issue.symbol}）` : issue.assetName;
  return target ? `${target} · ${issue.ruleLabel}` : issue.ruleLabel;
}

/** Shared business wording; source intervals are request limits, never update guarantees. */
export function riskMonitoringSourceText(source: {
  symbol: string;
  assetName?: string | undefined;
  provider: string | null;
  reason: string;
  minIntervalSeconds: number | null;
}) {
  const name =
    source.assetName && source.assetName !== source.symbol
      ? `${source.assetName}（${source.symbol}）`
      : source.symbol;
  const provider = source.provider ? `${sourceNames[source.provider] ?? '当前来源'} · ` : '';
  const reason = sourceReasons[source.reason] ?? '等待来源状态更新';
  const interval = source.minIntervalSeconds
    ? ` · 最短请求间隔 ${source.minIntervalSeconds} 秒，上游更新频率未知`
    : '';
  return `${name} · ${provider}${reason}${interval}`;
}
