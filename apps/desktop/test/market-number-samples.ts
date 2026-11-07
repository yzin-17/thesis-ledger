import {
  fundNavSchema,
  fundValuationSchema,
  fundValuationTodaySchema,
  quoteSchema,
} from '@thesis-ledger/schemas';
import type { MarketTradingOverlayState } from '../src/features/market-detail/useMarketTradingOverlays';
import type { ChartPoint } from '../src/features/market-detail/market-chart-model';
import { measureChartRange } from '../src/features/market-detail/market-trading-overlay-model';
import { marketPercentSample } from './market-percent-unit-samples';
import samples from './market-number-samples.json';
export { samples as marketNumberSamples };
export function marketNumberSample(name: string) {
  const sample = samples.find((s) => s.name === name);
  if (!sample) throw new Error('未知行情数字样本');
  const seed = marketPercentSample('zero'),
    value = sample.value;
  const quote =
    value === null
      ? undefined
      : quoteSchema.parse({
          ...seed.quote,
          price: value,
          previousClose: value,
          open: value,
          high: value,
          low: value,
        });
  const nav =
    value === null ? undefined : fundNavSchema.parse({ ...seed.history.at(-1), unitNav: value });
  const available = value !== null && value > 0;
  const valuation = fundValuationSchema.parse({
    ...seed.valuation,
    estimatedNav: available ? value : null,
    changePercent: available ? 0 : null,
    quality: available ? 'partial' : 'unavailable',
    anchor: available ? seed.valuation.anchor : null,
    estimatedAt: available ? seed.valuation.estimatedAt : null,
    oldestPriceAt: available ? seed.valuation.oldestPriceAt : null,
    pricedCoverage: available ? 0.5 : 0,
    reasons: available ? seed.valuation.reasons : ['market_closed', 'nav_unavailable'],
  });
  const today = fundValuationTodaySchema.parse({
    ...seed.today,
    points: seed.today.points.map((p) => ({
      ...p,
      valuation: {
        ...valuation,
        estimatedAt: available ? p.at : null,
        oldestPriceAt: available ? p.at : null,
      },
    })),
  });
  let bars: typeof seed.bars = [];
  if (value !== null) {
    bars = seed.bars.map((bar, index) => {
      let price = value;
      if (index === 1) price = 0;
      return { ...bar, open: price, high: price, low: price, close: price, volume: value };
    });
  }
  const last = bars.at(-1);
  let point: ChartPoint | undefined;
  if (last) {
    const dif = value === null ? null : -value;
    point = {
      date: '2026-11-07',
      bar: last,
      indicators: {
        MA: { timestamp: last.timestamp, values: { ma5: value } },
        MACD: { timestamp: last.timestamp, values: { dif, dea: value, histogram: value } },
        RSI: { timestamp: last.timestamp, values: { rsi12: value } },
      },
      comparableIndicators: { MA: true, MACD: true, RSI: true },
      comparable: true,
    };
  }
  const measurement = measureChartRange(bars, '2026-07-01', '2026-08-07');
  const overlay: MarketTradingOverlayState = {
    state: {
      scope: 'market-number-sample',
      trades: false,
      cost: false,
      risk: '',
      measuring: false,
      from: null,
      to: null,
    },
    update() {
      throw new Error('只读样本不更新状态');
    },
    model: { markers: [], lines: [], measurement },
    measurement,
    riskInvalid: false,
    notice: undefined,
    canReadTrades: false,
    canCost: false,
    comparable: false,
    consumeClick: () => false,
  };
  return {
    sample,
    quote,
    nav,
    valuation,
    today,
    bars,
    point,
    overlay,
    symbol: seed.symbol,
    day: seed.day,
    available,
  };
}
