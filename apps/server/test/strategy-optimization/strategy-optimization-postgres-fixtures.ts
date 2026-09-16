import { strategySchemaV2, type StrategySchemaV2 } from '@thesis-ledger/schemas';

/** PostgreSQL 服务级测试的确定性输入，不承担 Service、数据库或并发断言。 */
export const createStrategyFixture = (symbol: string, suffix: string) =>
  (stopPercent: string, takeProfit?: string): StrategySchemaV2 =>
    strategySchemaV2.parse({
      schemaVersion: '2',
      name: `PostgreSQL 服务级 E2E ${suffix}`,
      signalSources: [
        {
          id: 'price',
          asset: { symbol, market: 'CN', assetType: 'stock' },
          timeframe: '1d',
          series: ['open', 'high', 'low', 'close', 'volume'],
        },
      ],
      executionInstrument: { symbol, market: 'CN', assetType: 'stock' },
      primaryTimeframe: '1d',
      entry: {
        type: 'compare',
        operator: 'gt',
        left: { type: 'series', sourceId: 'price', field: 'close' },
        right: { type: 'constant', value: '0' },
      },
      exit: {
        type: 'compare',
        operator: 'lt',
        left: { type: 'series', sourceId: 'price', field: 'close' },
        right: { type: 'constant', value: '999999' },
      },
      sizing: { type: 'fixedQuantity', quantity: '100' },
      risk: [
        { type: 'fixedStop', percent: stopPercent },
        ...(takeProfit ? [{ type: 'fixedTakeProfit' as const, percent: takeProfit }] : []),
      ],
      execution: {
        mode: 'exchange',
        orderType: 'market',
        timeInForce: 'DAY',
        timing: 'nextEligibleBarOpen',
      },
      cost: { commissionRate: '0', slippageRate: '0' },
    }) as StrategySchemaV2;

export const runConfig = {
  startDate: '2026-01-01',
  endDate: '2026-09-10',
  dataAsOf: '2026-09-11T08:00:00.000Z',
  baseCurrency: 'CNY' as const,
  initialCash: { CNY: '100000' },
  valuationPolicy: {
    baseTimezone: 'Asia/Shanghai',
    dailyValuationTime: '15:00',
    pricePolicy: 'latestAvailable' as const,
    fxPolicy: 'latestAvailable' as const,
  },
};
export const split = {
  development: { start: '2026-01-01', end: '2026-04-30' },
  validation: { start: '2026-05-01', end: '2026-07-31' },
  test: { start: '2026-08-01', end: '2026-09-10' },
};
export const budget = {
  maxAiCalls: 10,
  maxBacktestRuns: 30,
  maxInputTokens: 200_000,
  maxOutputTokens: 20_000,
  maxCost: '100',
  maxDurationSeconds: 1_800,
};
export const proposal = {
  changes: [{ parameterId: 'risk.0.percent', value: '0.07' }],
  reason: '服务级集成测试参数候选',
  evidenceRefs: ['postgres-service-e2e'],
};

export const waitUntil = async (predicate: () => Promise<boolean>, timeoutMs = 8_000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
  throw new Error('等待服务级集成状态变化超时');
};
