export type ScreenshotSource = 'alipay' | 'ths' | 'broker' | 'bank' | 'fund-platform' | 'unknown';

export const screenshotSources: readonly ScreenshotSource[] = [
  'alipay',
  'ths',
  'broker',
  'bank',
  'fund-platform',
  'unknown',
];

export const detectScreenshotSource = (text: string): ScreenshotSource => {
  const normalized = text.toLowerCase();
  if (normalized.includes('支付宝') || normalized.includes('蚂蚁财富')) return 'alipay';
  if (normalized.includes('同花顺') || normalized.includes('ths')) return 'ths';
  if (normalized.includes('证券') || normalized.includes('券商')) return 'broker';
  if (normalized.includes('银行') || normalized.includes('bank')) return 'bank';
  if (normalized.includes('基金') || normalized.includes('fund')) return 'fund-platform';
  return 'unknown';
};
