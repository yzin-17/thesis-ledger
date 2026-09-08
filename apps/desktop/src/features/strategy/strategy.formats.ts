export const fractionToPercent = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? String(value * 100) : '';

export const percentToFraction = (value: string) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed / 100 : Number.NaN;
};

export const stopLossFieldLabel = (type: unknown) => {
  if (type === 'atr') return 'ATR 倍数';
  if (type === 'trailing') return '移动止损比例';
  return '止损比例';
};

export const stopLossDefaultValue = (type: unknown) => (type === 'atr' ? 2 : 0.1);

export const stopLossFieldDescription = (type: unknown) =>
  type === 'atr' ? '单位：ATR 倍数，建议范围 0.1–10。' : '单位：百分比，范围 0–100%。';

export const sizingFieldLabel = (type: unknown) => {
  if (type === 'fixed') return '固定投入金额';
  if (type === 'risk') return '单笔风险比例';
  return '可用现金比例';
};

export const sizingFieldDescription = (type: unknown) => {
  if (type === 'fixed') return '单位：人民币投入金额。';
  if (type === 'risk') return '范围 0–100%；按权益 × 比例作为风险预算，再除以每股止损距离。';
  return '范围 0–100%；按下单时可用现金的百分比投入。';
};

export const sizingDefaultValue = (type: unknown) => {
  if (type === 'fixed') return 10_000;
  if (type === 'risk') return 0.01;
  return 0.5;
};

export const hasUnappliedJson = (jsonText: string, draft: Record<string, unknown>) =>
  jsonText !== JSON.stringify(draft, null, 2);

export const shouldApplyAdvancedJson = (
  activeTab: string,
  nextTab: string,
  jsonText: string,
  draft: Record<string, unknown>,
) => activeTab === 'advanced' && nextTab === 'common' && hasUnappliedJson(jsonText, draft);
