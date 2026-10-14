// 使用 pnpm exec tsx 执行；输出受控夹具 JSON，不读写业务数据。
import prettier from 'prettier';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import {
  aggregateMarketDailyBars,
  canonicalMarketPeriodEncoding,
} from '../packages/domain/dist/index.js';
import {
  canonicalBarSeriesEncoding,
  canonicalMarketPeriodIndicatorEncoding,
  marketPeriodIndicatorRequestSchema,
} from '../packages/schemas/dist/index.js';
import {
  calendarFixture,
  dailyFixture,
  inputFixture,
} from '../packages/domain/test/fixtures/market-period.fixture.ts';
const digest = (s) => createHash('sha256').update(s).digest('hex');
const calendar = calendarFixture('2025-01-01', '2027-12-31');
const bars = calendar.sessions
  .filter((s) => s.tradingDate.startsWith('2026-'))
  .map((s, i) => dailyFixture(s.tradingDate, 10 + i));
const cases = ['5d', '1w', '1mo', '1y'].map((timeframe) => {
  const aggregate = aggregateMarketDailyBars(
    inputFixture({
      calendar,
      bars,
      timeframe,
      evaluationAsOf: '2027-01-04T00:00:00.000Z',
      ...(timeframe === '5d' ? { anchorTradingDate: '2026-12-31' } : {}),
    }),
  );
  const aggregationEncoding = canonicalMarketPeriodEncoding(aggregate);
  const identity = { symbol: '510300.SH', assetType: 'ETF', timeframe, adjustment: 'none' };
  const points = aggregate.points.map((p) => ({
    timestamp: p.timestamp,
    open: p.open,
    high: p.high,
    low: p.low,
    close: p.close,
    volume: p.volume,
    amount: p.amount,
    completionStatus: p.completionStatus,
    availableAt: p.availableAt,
  }));
  const periodContext = {
    protocol: 'market-period-indicator-v1',
    aggregationFingerprint: digest(aggregationEncoding),
    pointFingerprint: digest(canonicalBarSeriesEncoding(identity, points)),
  };
  const payload = marketPeriodIndicatorRequestSchema.parse({
    contractVersion: 3,
    identity,
    points,
    periodContext,
    inputFingerprint: digest(canonicalMarketPeriodIndicatorEncoding(periodContext)),
    requests: [
      { name: 'MA', parameters: { period: 5 } },
      { name: 'MACD', parameters: { fast: 3, slow: 6, signal: 3 } },
      { name: 'RSI', parameters: { short: 3, mid: 5, long: 8 } },
    ],
  });
  return { timeframe, aggregationEncoding, payload };
});
const formatConfig = await prettier.resolveConfig(
  fileURLToPath(
    new URL('../packages/schemas/fixtures/market-period-indicator-v1.shared.json', import.meta.url),
  ),
);
process.stdout.write(
  await prettier.format(
    JSON.stringify(
      {
        description:
          '受控工作日日历与合成价格，仅用于跨运行时协议与实际指标计算；不证明真实交易所或来源可用性。',
        cases,
      },
      null,
      2,
    ),
    {
      ...formatConfig,
      filepath: fileURLToPath(
        new URL(
          '../packages/schemas/fixtures/market-period-indicator-v1.shared.json',
          import.meta.url,
        ),
      ),
    },
  ),
);
