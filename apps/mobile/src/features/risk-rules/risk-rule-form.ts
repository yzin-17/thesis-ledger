import { percentTextToRatio, ratioToPercentText } from '@thesis-ledger/domain';
import {
  riskRuleInputSchema,
  requiresRiskRuleAccount,
  type RiskRuleWire,
  riskRuleNotificationFromParameters,
  riskRuleNotificationSchema,
} from '@thesis-ledger/schemas';
export const riskKinds = [
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
] as const;
export const riskScopes = [
  { value: 'security', label: '证券' },
  { value: 'account', label: '账户' },
  { value: 'portfolio', label: '组合' },
] as const;
export const riskSeverities = [
  { value: 'info', label: '提示' },
  { value: 'warning', label: '警告' },
  { value: 'error', label: '严重' },
  { value: 'critical', label: '关键' },
] as const;
const percentKinds = new Set([
  'cost-stop',
  'take-profit',
  'position-concentration',
  'trailing-stop',
]);
const aggregateKinds = new Set([
  'drawdown',
  'sector-concentration',
  'asset-concentration',
  'volatility-exposure',
  'correlation',
]);
export function isRiskPercentage(kind: string) {
  return percentKinds.has(kind);
}
export function allowedRiskScopes(kind: string) {
  if (aggregateKinds.has(kind)) return riskScopes.filter((row) => row.value !== 'security');
  return riskScopes.filter((row) => row.value === 'security');
}
export type RiskForm = {
  notificationCooldown?: string;
  notificationProviders?: string[] | undefined;
  notificationEnabled?: boolean;
  kind: (typeof riskKinds)[number]['value'];
  scope: (typeof riskScopes)[number]['value'];
  severity: (typeof riskSeverities)[number]['value'];
  threshold: string;
  symbol: string;
  accountId: string;
  enabled: boolean;
};
export function riskForm(rule?: RiskRuleWire): RiskForm {
  const notification = rule?.notification ?? riskRuleNotificationFromParameters(rule?.parameters);
  let threshold = '';
  if (rule) {
    threshold = String(rule.threshold);
    if (isRiskPercentage(rule.kind)) threshold = ratioToPercentText(rule.threshold);
  }
  return {
    notificationCooldown: String(notification.cooldownMinutes),
    notificationProviders: rule ? notification.providers : [],
    notificationEnabled: notification.enabled,
    kind: (rule?.kind as RiskForm['kind']) ?? 'price-below',
    scope: rule?.scope ?? 'security',
    severity: rule?.severity ?? 'warning',
    threshold,
    symbol: rule?.symbol ?? '',
    accountId: rule?.accountId ?? '',
    enabled: rule?.enabled ?? false,
  };
}
function riskThreshold(form: Pick<RiskForm, 'kind' | 'threshold'>): number {
  const value = isRiskPercentage(form.kind)
    ? percentTextToRatio(form.threshold)
    : Number(form.threshold);
  if (!form.threshold.trim() || value === null || !Number.isFinite(value) || value < 0)
    throw new Error('请输入有效的非负阈值。');
  if (isRiskPercentage(form.kind) && (value <= 0 || value > 1))
    throw new Error('百分比阈值须大于 0 且不超过 100%。');
  return value;
}

export function buildRiskInput(form: RiskForm, previous?: RiskRuleWire) {
  if (!allowedRiskScopes(form.kind).some((row) => row.value === form.scope))
    throw new Error('规则类型与作用范围不匹配。');
  if (previous && previous.scope !== 'portfolio' && form.scope === 'portfolio')
    throw new Error('已有证券或账户规则不能改为组合规则，请新建。');
  if (previous?.accountId && !form.accountId)
    throw new Error('已有账户绑定不能直接清空，请新建所需范围的规则。');
  const value = riskThreshold(form);
  if (requiresRiskRuleAccount(form.kind, form.scope) && !form.accountId)
    throw new Error('该证券规则必须绑定账户。');
  return riskRuleInputSchema.parse({
    kind: form.kind,
    scope: form.scope,
    severity: form.severity,
    threshold: value,
    enabled: form.enabled,
    notification: riskNotificationInput(form),
    ...(form.scope === 'security' ? { symbol: form.symbol } : {}),
    ...(form.scope !== 'portfolio' && form.accountId ? { accountId: form.accountId } : {}),
  });
}

function riskNotificationInput(form: RiskForm) {
  if (form.notificationCooldown === undefined) return undefined;
  if (!form.notificationCooldown.trim()) throw new Error('通知冷却时间不能为空。');
  return riskRuleNotificationSchema.parse({ enabled: form.notificationEnabled,
    cooldownMinutes: Number(form.notificationCooldown), providers: form.notificationProviders });
}
