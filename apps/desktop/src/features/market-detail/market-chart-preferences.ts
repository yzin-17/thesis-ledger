export type ChartPreference = {
  visibleRange: number;
  chartMode: 'candles' | 'close';
  activePane: 'MACD' | 'RSI';
  visibleIndicators: Array<'MA' | 'MACD' | 'RSI'>;
  visibleMA: Array<'ma5' | 'ma10' | 'ma20' | 'ma60'>;
  macdParams: { fast: number; slow: number; signal: number };
  rsiPeriod: 6 | 12 | 24;
};

export type MarketIndicatorParams = {
  fast: number;
  slow: number;
  signal: number;
  short: number;
  mid: number;
  long: number;
};

export const preferenceKey = 'thesis-ledger:market-chart-preferences';
export const defaultPreference: ChartPreference = {
  visibleRange: 90,
  chartMode: 'candles',
  activePane: 'MACD',
  visibleIndicators: ['MA', 'MACD', 'RSI'],
  visibleMA: ['ma5', 'ma20', 'ma60'],
  macdParams: { fast: 12, slow: 26, signal: 9 },
  rsiPeriod: 12,
};

export const normalizeMacdParams = (value: unknown): ChartPreference['macdParams'] => {
  if (!value || typeof value !== 'object') return defaultPreference.macdParams;
  const record = value as Record<string, unknown>;
  const fast = record.fast;
  const slow = record.slow;
  const signal = record.signal;
  if (
    ![fast, slow, signal].every(
      (item) => typeof item === 'number' && Number.isInteger(item) && item >= 2 && item <= 200,
    ) ||
    (fast as number) >= (slow as number)
  ) {
    return defaultPreference.macdParams;
  }
  return { fast: fast as number, slow: slow as number, signal: signal as number };
};

export const readPreference = (): ChartPreference => {
  if (typeof window === 'undefined') return defaultPreference;
  try {
    const raw = window.localStorage.getItem(preferenceKey);
    if (!raw) return defaultPreference;
    const parsed = JSON.parse(raw) as Partial<ChartPreference>;
    const visibleRange = [0, 30, 90, 180, 365].includes(parsed.visibleRange ?? -1)
      ? parsed.visibleRange!
      : defaultPreference.visibleRange;
    const activePane = parsed.activePane === 'RSI' ? 'RSI' : 'MACD';
    const chartMode = parsed.chartMode === 'close' ? 'close' : 'candles';
    const visibleIndicators = Array.isArray(parsed.visibleIndicators)
      ? parsed.visibleIndicators.filter((item): item is 'MA' | 'MACD' | 'RSI' =>
          ['MA', 'MACD', 'RSI'].includes(item),
        )
      : defaultPreference.visibleIndicators;
    const visibleMA = Array.isArray(parsed.visibleMA)
      ? parsed.visibleMA.filter((item): item is ChartPreference['visibleMA'][number] =>
          ['ma5', 'ma10', 'ma20', 'ma60'].includes(item),
        )
      : defaultPreference.visibleMA;
    const macdParams = normalizeMacdParams(parsed.macdParams);
    const rsiPeriod = [6, 12, 24].includes(parsed.rsiPeriod ?? 0)
      ? (parsed.rsiPeriod as 6 | 12 | 24)
      : defaultPreference.rsiPeriod;
    return {
      visibleRange,
      chartMode,
      activePane,
      visibleIndicators,
      visibleMA,
      macdParams,
      rsiPeriod,
    };
  } catch {
    return defaultPreference;
  }
};
