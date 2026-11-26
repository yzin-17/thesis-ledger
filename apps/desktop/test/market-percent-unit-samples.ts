import {
  chipDistributionSchema,
  fundNavHistorySchema,
  fundValuationSchema,
  fundValuationTodaySchema,
  quoteSchema,
} from '@thesis-ledger/schemas';
import type { MarketChartBar } from '../src/features/market-detail/market-chart-types';
export const marketPercentSamples = [
  {
    name: 'ordinary',
    ratio: 0.123456,
    percent: 12.3456,
    price: 1.123456,
    previous: 1,
    chip: 0.123456,
    ratioLabel: '+12.35%',
    percentLabel: '+12.35%',
    quoteLabel: '+12.35%',
    chipLabel: '12.35%',
  },
  {
    name: 'tiny-positive',
    ratio: 1e-9,
    percent: 1e-7,
    price: 1.000000001,
    previous: 1,
    chip: 1e-9,
    ratioLabel: '+1E-7%',
    percentLabel: '+1E-7%',
    quoteLabel: '+1E-7%',
    chipLabel: '1E-7%',
  },
  {
    name: 'tiny-negative',
    ratio: -1e-9,
    percent: -1e-7,
    price: 0.999999999,
    previous: 1,
    chip: 1e-9,
    ratioLabel: '-1E-7%',
    percentLabel: '-1E-7%',
    quoteLabel: '-1E-7%',
    chipLabel: '1E-7%',
  },
  {
    name: 'zero',
    ratio: 0,
    percent: 0,
    price: 1,
    previous: 1,
    chip: 0,
    ratioLabel: '+0.00%',
    percentLabel: '+0.00%',
    quoteLabel: '0.00%',
    chipLabel: '0.00%',
  },
  {
    name: 'maximum-percent',
    ratio: 0.25,
    percent: Number.MAX_VALUE,
    price: 1.25,
    previous: 1,
    chip: 0.25,
    ratioLabel: '+25.00%',
    percentLabel: '+1.797693E308%',
    quoteLabel: '+25.00%',
    chipLabel: '25.00%',
  },
  {
    name: 'missing',
    ratio: null,
    percent: null,
    price: 1,
    previous: 0,
    chip: null,
    ratioLabel: '—',
    percentLabel: null,
    quoteLabel: '--',
    chipLabel: null,
  },
];
export function marketPercentSample(name: string) {
  const sample = marketPercentSamples.find((s) => s.name === name);
  if (!sample) throw new Error('未知行情百分比样本');
  const day = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const at = day + 'T06:01:00Z',
    symbol = '000001.OF';
  const quote = quoteSchema.parse({
    version: 1,
    symbol: '000001.SZ',
    open: sample.price,
    high: Math.max(sample.price, sample.previous),
    low: Math.min(sample.price, sample.previous),
    price: sample.price,
    previousClose: sample.previous,
    volume: null,
    amount: null,
    stale: false,
    provider: '受控行情',
    fetchedAt: at,
    marketTime: at,
    freshness: 'delayed',
    units: { priceCurrency: 'CNY', volume: 'share', turnoverCurrency: 'CNY' },
  });
  const chip =
    sample.chip === null
      ? undefined
      : chipDistributionSchema.parse({
          version: 1,
          symbol: '000001.SZ',
          averageCost: 1,
          profitRatio: sample.chip,
          range70: [0.8, 1.2],
          range90: [0.5, 1.5],
          concentration: sample.chip,
          provider: '受控筹码',
          engineVersion: 'controlled',
          calculatedAt: at,
        });
  const valuation = fundValuationSchema.parse({
    version: 1,
    symbol,
    marketState: 'closed',
    quality: sample.percent === null ? 'unavailable' : 'partial',
    estimatedNav: sample.percent === null ? null : sample.price,
    changePercent: sample.percent,
    anchor: sample.percent === null ? null : { unitNav: 1, navDate: '2026-11-05T00:00:00Z' },
    estimatedAt: sample.percent === null ? null : at,
    oldestPriceAt: sample.percent === null ? null : at,
    disclosureCoverage: 0.5,
    pricedCoverage: sample.percent === null ? 0 : 0.5,
    reasons:
      sample.percent === null
        ? ['market_closed', 'nav_unavailable']
        : ['market_closed', 'partial_coverage'],
    method: 'disclosed-holdings-qfq-v1',
  });
  const today = fundValuationTodaySchema.parse({
    version: 1,
    symbol,
    date: day,
    timezone: 'Asia/Shanghai',
    asOf: day + 'T06:02:00Z',
    points: [
      {
        at: day + 'T06:00:00Z',
        valuation: {
          ...valuation,
          estimatedAt: sample.percent === null ? null : day + 'T06:00:00Z',
          oldestPriceAt: sample.percent === null ? null : day + 'T06:00:00Z',
        },
      },
      { at, valuation },
    ],
  });
  const history = fundNavHistorySchema.parse(
    ['2026-07-01', '2026-08-07', '2026-11-07'].map((date, index) => ({
      version: 1,
      symbol,
      unitNav: index === 2 ? sample.price : sample.previous,
      navDate: date + 'T00:00:00Z',
      provider: '受控净值',
      fetchedAt: at,
      freshness: 'delayed',
    })),
  );
  const bars: MarketChartBar[] = history.map((point) => ({
    timestamp: point.navDate,
    open: point.unitNav,
    high: point.unitNav,
    low: point.unitNav,
    close: point.unitNav,
    volume: 100,
    amount: 100,
    symbol: '000001.SZ',
    timeframe: '1d',
    completionStatus: 'complete',
    provider: '受控行情',
    freshness: 'delayed',
    fetchedAt: at,
    availableAt: point.navDate,
  }));
  return { sample, quote, chip, valuation, today, history, bars, symbol, day };
}
