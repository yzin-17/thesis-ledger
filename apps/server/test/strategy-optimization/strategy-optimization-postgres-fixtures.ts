import { readFileSync } from 'node:fs';
import {
  backtestExecutionModelSchemaV3,
  runConfigSchemaV3,
  strategySchema,
  type BacktestStrategy,
} from '@thesis-ledger/schemas';

/** PostgreSQL 服务级测试的确定性输入，不承担 Service、数据库或并发断言。 */
export const createStrategyFixture =
  (symbol: string, suffix: string) =>
  (stopPercent: string, takeProfit?: string): BacktestStrategy =>
    strategySchema.parse({
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
    }) as BacktestStrategy;

export const runConfig = {
  schemaVersion: '3' as const,
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
  executionPriceProtocol: {
    protocolVersion: 'execution-price-v1' as const,
    priceBasis: {
      adjustment: 'qfq' as const,
      method: 'provider-native' as const,
      methodVersion: 'provider-defined-v1',
      basisScope: 'provider-defined' as const,
      anchor: null,
      revision: { origin: 'local-observation' as const, contentHash: 'a'.repeat(64) },
      observedAt: '2026-09-11T08:00:00.000Z',
      quantityBasis: 'normalized-units' as const,
      volumeBasis: 'unknown' as const,
      dividendMeaning: 'provider-defined' as const,
      dividendEvidenceRef: null,
      conversionAvailable: false,
      conversionEvidenceRef: null,
      derivation: null,
    },
    accountingBasis: 'normalized-series' as const,
    history: { basis: 'fixed-provider-snapshot' as const },
  },
};

const executionModelTemplate = backtestExecutionModelSchemaV3.parse(
  JSON.parse(
    readFileSync(
      new URL(
        '../../../../packages/schemas/fixtures/backtest-execution-model.cn-2024q1.json',
        import.meta.url,
      ),
      'utf8',
    ),
  ) as unknown,
);

export const createNormalizedRunConfig = () =>
  runConfigSchemaV3.parse({
    ...runConfig,
    executionModel: backtestExecutionModelSchemaV3.parse({
      ...executionModelTemplate,
      scope: {
        ...executionModelTemplate.scope,
        range: { start: runConfig.startDate, end: runConfig.endDate },
      },
      segments: executionModelTemplate.segments.map((segment) => {
        if (segment.execution.mode !== 'exchange') return segment;
        return {
          ...segment,
          range: { start: runConfig.startDate, end: runConfig.endDate },
          execution: {
            ...segment.execution,
            price: { kind: 'noDailyLimit', reason: '价格已处于归一化连续坐标' },
            normalizedExecution: {
              priceCoordinate: 'continuous-decimal',
              quantityUnits: 'continuous-normalized-decimal',
              lotSizeConstraint: 'not-applied',
              tickSizeConstraint: 'not-applied',
              dailyPriceLimit: 'not-applied',
              feeBasis: 'simulatedTurnover',
            },
          },
        };
      }),
    }),
  });

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
