import type {
  KnownRiskRuleKind,
  RiskRuleRecord,
  RiskRuleScope,
  RiskRuleSeverity,
  RiskTestRecord,
} from './risk.types.js';
import { requiresRiskRuleAccount } from '@thesis-ledger/schemas';

export const riskRuleKindOptions: Array<{ value: KnownRiskRuleKind; label: string }> = [
  { value: 'price-below', label: '价格低于' },
  { value: 'price-above', label: '价格高于' },
  { value: 'cost-stop', label: '成本止损' },
  { value: 'take-profit', label: '止盈' },
  { value: 'position-concentration', label: '持仓集中度' },
  { value: 'fixed-stop', label: '固定止损' },
  { value: 'trailing-stop', label: '移动止损' },
  { value: 'drawdown', label: '回撤' },
  { value: 'ma', label: '均线' },
  { value: 'rsi', label: 'RSI' },
  { value: 'macd', label: 'MACD' },
  { value: 'atr', label: 'ATR' },
  { value: 'volume', label: '成交量' },
  { value: 'chip-peak', label: '筹码峰' },
  { value: 'chip-ratio', label: '筹码比例' },
  { value: 'chip-migration', label: '筹码迁移' },
  { value: 'sector-concentration', label: '行业集中度' },
  { value: 'asset-concentration', label: '资产集中度' },
  { value: 'volatility-exposure', label: '波动暴露' },
  { value: 'correlation', label: '组合相关性' },
];

export const riskScopeOptions: Array<{ value: RiskRuleScope; label: string }> = [
  { value: 'security', label: '证券' },
  { value: 'account', label: '账户' },
  { value: 'portfolio', label: '组合' },
];

const securityRuleKinds: ReadonlySet<string> = new Set([
  'fixed-stop',
  'cost-stop',
  'take-profit',
  'price-above',
  'price-below',
  'position-concentration',
  'trailing-stop',
  'ma',
  'rsi',
  'macd',
  'atr',
  'volume',
  'chip-peak',
  'chip-ratio',
  'chip-migration',
]);

const aggregateRuleKinds: ReadonlySet<string> = new Set([
  'drawdown',
  'sector-concentration',
  'asset-concentration',
  'volatility-exposure',
  'correlation',
]);

export const riskRuleScopeOptionsForKind = (kind: string) => {
  if (securityRuleKinds.has(kind)) {
    return riskScopeOptions.filter((option) => option.value === 'security');
  }
  if (aggregateRuleKinds.has(kind)) {
    return riskScopeOptions.filter((option) => option.value !== 'security');
  }
  return riskScopeOptions;
};

export const riskRuleNeedsAccount = (kind: string) => requiresRiskRuleAccount(kind, 'security');

export const isRiskRuleScopeAllowed = (kind: string, scope: RiskRuleScope) =>
  riskRuleScopeOptionsForKind(kind).some((option) => option.value === scope);

export const riskSeverityOptions: Array<{ value: RiskRuleSeverity; label: string }> = [
  { value: 'info', label: '提示' },
  { value: 'warning', label: '警告' },
  { value: 'error', label: '错误' },
  { value: 'critical', label: '严重' },
];

const labelFor = <T extends string>(options: Array<{ value: T; label: string }>, value: string) =>
  options.find((option) => option.value === value)?.label ?? value;

export const riskRuleKindLabel = (value: string) => labelFor(riskRuleKindOptions, value);
export const riskScopeLabel = (value: string) => labelFor(riskScopeOptions, value);
export const riskSeverityLabel = (value: string) => labelFor(riskSeverityOptions, value);

export const percentageRuleKinds: ReadonlySet<string> = new Set([
  'cost-stop',
  'take-profit',
  'position-concentration',
  'trailing-stop',
]);

export const isPercentageRule = (kind: string) => percentageRuleKinds.has(kind);

export const formatThreshold = (kind: string, threshold: number) => {
  if (isPercentageRule(kind)) return `${(threshold * 100).toLocaleString('zh-CN')}%`;
  return threshold.toLocaleString('zh-CN', { maximumFractionDigits: 6 });
};

export const ruleTargetLabel = (
  rule: {
    scope: string;
    symbol: string | null | undefined;
    accountId: string | null | undefined;
  },
  accountName?: string,
) => {
  if (rule.scope === 'security') {
    const symbol = rule.symbol ?? '未指定证券';
    return rule.accountId ? `${symbol} · ${accountName ?? '指定账户'}` : symbol;
  }
  if (rule.scope === 'account') return rule.accountId ?? '未指定账户';
  return '全组合';
};

export const rulePreview = (input: {
  kind: string;
  scope: string;
  threshold: number | null;
  symbol?: string;
  accountId?: string;
  accountLabel?: string;
}) => {
  let target = '当前组合';
  if (input.scope === 'security') {
    target = input.symbol || '当前证券';
    if (input.accountId) target += ` · ${input.accountLabel ?? '指定账户'}`;
  } else if (input.scope === 'account') target = input.accountId || '当前账户';
  const threshold =
    input.threshold === null ? '待填写' : formatThreshold(input.kind, input.threshold);
  const kind = riskRuleKindLabel(input.kind);
  return `${target} · ${kind} ${threshold}`;
};

export const riskTestRecordForRule = (
  records: Record<string, RiskTestRecord>,
  rule: Pick<RiskRuleRecord, 'id' | 'version'>,
) => {
  const record = records[rule.id];
  if (!record || record.ruleVersion !== rule.version) return null;
  return record;
};

export const formatDateTime = (value: string | null | undefined) => {
  if (!value) return '暂无';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '暂无' : date.toLocaleString('zh-CN');
};

export const riskEventMode = (event: {
  mode?: string | null;
  context?: Record<string, unknown> | null;
}) => {
  if (event.mode === 'actual' || event.mode === 'shadow') return event.mode;
  const contextMode = event.context?.mode;
  if (contextMode === 'actual' || contextMode === 'shadow') return contextMode;
  return null;
};

export const riskModeLabel = (mode: string | null | undefined) => {
  if (mode === 'shadow') return '模拟风险';
  if (mode === 'actual') return '实际风险';
  return '模式未知';
};

export const riskChannelLabel = (channel: string) => {
  if (channel === 'feishu') return '飞书';
  if (channel === 'email') return '邮件';
  if (channel === 'webhook') return 'Webhook';
  return channel;
};

export const riskStatusLabel = (status: string) => {
  if (status === 'sent' || status === 'success') return '已发送';
  if (status === 'delivered') return '已送达';
  if (status === 'retrying') return '重试中';
  if (status === 'failed') return '失败';
  if (status === 'queued' || status === 'pending') return '排队中';
  return `未知状态（${status}）`;
};

export const riskSeverityTone = (severity: string) => {
  if (severity === 'critical' || severity === 'error') return 'destructive' as const;
  if (severity === 'warning') return 'outline' as const;
  return 'secondary' as const;
};

export const riskStatusTone = (status: string) => {
  if (status === 'failed') return 'destructive' as const;
  if (status === 'delivered' || status === 'sent' || status === 'success') {
    return 'secondary' as const;
  }
  return 'outline' as const;
};
