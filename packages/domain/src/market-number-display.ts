type MarketNumberPrecision = 'compact' | 'valuation' | 'measurement';
type QuoteCurrency = 'CNY' | 'HKD' | 'USD';

function createFormatters(options: Intl.NumberFormatOptions) {
  return {
    normal: new Intl.NumberFormat('zh-CN', options),
    scientific: new Intl.NumberFormat('zh-CN', {
      ...options,
      notation: 'scientific',
      minimumFractionDigits: 0,
      maximumFractionDigits: 6,
    }),
  };
}
const numbers = {
  compact: createFormatters({ maximumFractionDigits: 4 }),
  valuation: createFormatters({ minimumFractionDigits: 4, maximumFractionDigits: 4 }),
  measurement: createFormatters({ maximumFractionDigits: 6 }),
};
function quoteFormatters(currency?: QuoteCurrency) {
  return createFormatters({
    minimumFractionDigits: 2,
    maximumFractionDigits: 20,
    ...(currency && { style: 'currency', currency }),
  });
}
const quotes = {
  CNY: quoteFormatters('CNY'),
  HKD: quoteFormatters('HKD'),
  USD: quoteFormatters('USD'),
  unknown: quoteFormatters(),
};

function formatValue(
  value: number | null | undefined,
  formats: ReturnType<typeof createFormatters>,
) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  if (value === 0) return formats.normal.format(0);
  if (Math.abs(value) >= 1e21) return formats.scientific.format(value);
  const parts = formats.normal.formatToParts(value);
  const roundsToZero = parts.every(
    (part) => !['integer', 'fraction'].includes(part.type) || !/[1-9]/.test(part.value),
  );
  if (roundsToZero) return formats.scientific.format(value);
  return parts.map((part) => part.value).join('');
}

/** Market 数字事实读数；保留原精度，缺失与零分开，非零不会因格式化归零。 */
export function formatMarketNumber(
  value: number | null | undefined,
  precision: MarketNumberPrecision = 'compact',
): string {
  return formatValue(value, numbers[precision]);
}

/** 报价金额保留已知币种；目录未提供币种时直接说明未知。 */
export function formatMarketQuotePrice(
  value: number | null | undefined,
  currency: QuoteCurrency | undefined,
): string {
  const formatted = formatValue(value, quotes[currency ?? 'unknown']);
  if (formatted === '—' || currency) return formatted;
  return formatted + '（币种未知）';
}
