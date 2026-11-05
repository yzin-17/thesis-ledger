// 输出受控协议夹具，不读写业务数据，不访问外部来源。
import { createHash } from 'node:crypto';
import { aggregateMarketMinutes } from '../packages/domain/dist/index.js';
import { canonicalBarSeriesEncoding, canonicalMarketPeriodIndicatorEncoding,
  marketPeriodIndicatorRequestSchema } from '../packages/schemas/dist/index.js';

const hash = (value) => createHash('sha256').update(value).digest('hex');
const calendar = { market: 'US', timezone: 'America/New_York', revision: 'controlled-session-v1',
  availableAt: '2026-10-01T00:00:00Z', coverageStart: '2026-10-08', coverageEnd: '2026-10-08',
  sessions: [{ tradingDate: '2026-10-08', startAt: '2026-10-08T13:30:00Z', endAt: '2026-10-08T20:00:00Z' }] };
const evaluationAsOf = '2026-10-08T21:00:00Z';
const raw = Array.from({ length: 390 }, (_, index) => ({
  timestamp: new Date(Date.parse(calendar.sessions[0].startAt) + (index + 1) * 60_000).toISOString(),
  availableAt: evaluationAsOf, open: 100 + index, high: 102 + index, low: 99 + index,
  close: 101 + index, volume: 1000, amount: 100_000, completionStatus: 'complete' }));
const cases = ['5m', '15m', '30m', '60m'].map((timeframe) => {
  const identity = { symbol: 'SPY.US', assetType: 'ETF', timeframe, adjustment: 'none' };
  const aggregate = aggregateMarketMinutes({ calendar, timeframe, evaluationAsOf,
    includeOpeningBoundary: false, points: raw });
  const points = aggregate.map(({ tradingDate, bucketEndAt, observedEndAt, expectedMinutes, observedMinutes,
    openingBoundaryPoints, ...point }) => point);
  const rawFingerprint = hash(canonicalBarSeriesEncoding({ ...identity, timeframe: '1m' }, raw));
  const aggregationEncoding = JSON.stringify([calendar, timeframe, evaluationAsOf, rawFingerprint, aggregate]);
  const periodContext = { protocol: 'market-period-indicator-v1',
    aggregationFingerprint: hash(aggregationEncoding), pointFingerprint: hash(canonicalBarSeriesEncoding(identity, points)) };
  const payload = marketPeriodIndicatorRequestSchema.parse({ contractVersion: 3, identity, points,
    periodContext, inputFingerprint: hash(canonicalMarketPeriodIndicatorEncoding(periodContext)),
    requests: [{ name: 'MA', parameters: { period: 5 } },
      { name: 'MACD', parameters: { fast: 3, slow: 6, signal: 3 } },
      { name: 'RSI', parameters: { short: 3, mid: 5, long: 8 } }] });
  return { timeframe, aggregationEncoding, payload };
});
process.stdout.write(JSON.stringify({ description: '受控美股Session与合成分钟，只证明跨运行时协议和指标计算。', cases }, null, 2) + '\n');
