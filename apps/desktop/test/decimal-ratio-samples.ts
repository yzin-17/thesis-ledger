import {
  backtestExecutionModelSchemaV3,
  fundDailyErrorSchema,
  type BacktestNavResultV3,
} from '@thesis-ledger/schemas';
import modelFixture from './fixtures/nav-ratio-model.json';

export const tinyRatio = '0.' + '0'.repeat(399) + '1';
export function navRatioModel(rate = tinyRatio) {
  const model = structuredClone(modelFixture);
  model.scope.symbol = '000001.OF';
  model.segments[0]!.execution.subscriptionFee.rate = rate;
  model.segments[0]!.execution.redemptionFee.rate = rate;
  return backtestExecutionModelSchemaV3.parse(model);
}
export function navRatioResult(value: string, rate = tinyRatio) {
  // 受控组件读取投影；不作为冻结协议、来源或引擎验收。
  return {
    pendingRequestIds: [],
    completeness: 'complete',
    diagnostics: [],
    warnings: ['冻结说明：收益 0.00%'],
    executionSymbol: '000001.OF',
    dateRange: { startDate: '2026-09-08', endDate: '2026-09-15' },
    dataAsOf: '2026-09-15T00:00:00.000Z',
    navSource: { target: { upstreamSource: 'eastmoney' }, capturedAt: '2026-09-15T00:00:00.000Z' },
    navVisibility: {
      mode: 'research-assumption',
      rule: {
        fundType: 'domestic',
        delayWorkdays: 1,
        evidenceRef: '受控来源说明',
        applicableRange: { startDate: '2026-09-08', endDate: '2026-09-15' },
      },
    },
    visibilityDisclosure: {
      classification: 'research-assumption',
      assumptions: ['仅用于受控展示验收'],
    },
    executionModelDisclosure: { model: navRatioModel(rate) },
    cash: { settled: '100', unsettled: '0', currency: 'CNY' },
    position: { quantity: '1', settledQuantity: '1', unsettledQuantity: '0', averageCost: '1' },
    metrics: {
      cumulativeReturn: { status: 'available', value },
      sharpe: { status: 'available', value: '1.234567890123456789' },
      volatility: { status: 'unavailable', reason: '缺少有效估值' },
    },
    benchmark: { cagr: { status: 'available', value } },
    equityCurve: [],
    requests: [],
  } as unknown as BacktestNavResultV3;
}
export function fundRatioRow(relativeAbsolute: string, pricedCoverage = 1e-9) {
  return fundDailyErrorSchema.parse({
    symbol: '000001.OF',
    day: '2026-11-07',
    method: 'disclosed-holdings-qfq-v1',
    estimatedAt: '2026-11-07T07:00:00.000Z',
    estimatedNav: 1.01,
    pricedCoverage,
    quality: 'low_coverage',
    official: {
      unitNav: 1,
      navDate: '2026-11-07T00:00:00.000Z',
      provider: '受控来源',
      upstreamSource: '受控来源',
      fetchedAt: '2026-11-07T08:00:00.000Z',
      servedFromCache: true,
    },
    errors: { signed: '0.01', absolute: '0.01', relativeAbsolute },
  });
}
