import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { executionPriceProtocolSchema, backtestExecutionModelSchemaV3, researchLotShareWindowBenchmarkCostVersionV3,
  benchmarkExecutionModelCostVersionV3, type RunConfigV3, type BacktestSnapshotManifestV3 } from '@thesis-ledger/schemas';
import { hkResearchLotForFactV3, hkResearchLotForSourceV3 } from '../../src/backtest/backtest-hk-research-lot-v3.js';
import { instrumentFact } from '../../src/backtest/backtest-instrument-fact-v3.js';
import { applicableInstrumentObservationV3 } from '../../src/backtest/backtest-identity-observation-clock-v3.js';
import { calculateWholeShareBenchmarkReturnV3 } from '../../src/backtest/backtest-whole-share-benchmark-cost-v3.js';
import { shareWindowBenchmarkCostVersionV3, supportsWholeShareWindowBenchmarkV3 } from '../../src/backtest/backtest-share-window-benchmark-profile-v3.js';
import { shareWindowWarmupPolicyV3 } from '../../src/backtest/backtest-share-window-warmup-policy-v3.js';

const fixture = (name: string) => JSON.parse(readFileSync(
  new URL(`../../../../packages/schemas/fixtures/${name}`, import.meta.url), 'utf8'));
function input(sharesPerLot = '5000') {
  const model = fixture('backtest-execution-model.cn-2024q1.json');
  model.scope = { ...model.scope, symbol: '00147.HK', market: 'HK', currency: 'HKD', timezone: 'Asia/Hong_Kong' };
  const segment = model.segments[0];
  segment.execution.calendarMarket = 'HK'; segment.execution.price = { kind: 'noDailyLimit', reason: '港股日线研究' };
  segment.fees.currency = 'HKD'; segment.fees.commission = { ...segment.fees.commission, currency: 'HKD', rate: '0', minimum: { kind: 'none' } };
  segment.fees.stampDuty = { ...segment.fees.commission, side: 'both', rate: '0.001', amountRounding: { mode: 'ceil', decimalPlaces: 0 } };
  for (const key of ['transferFee', 'regulatoryFee', 'handlingFee']) segment.fees[key] = { treatment: 'notApplicable', reason: '定向数量用例未纳入' };
  segment.fees.brokerCommission = fixture('backtest-broker-commission.futu.json').HK;
  model.researchLotSize = { sharesPerLot, defaultSharesPerLot: '5000', origin: sharesPerLot === '5000' ? 'providerCurrent' : 'userOverride',
    historicalChanges: 'unverified', source: { provider: 'webull-current-quote', sourceUrl: 'https://www.webull.hk/quote/hkg-00147',
      sha256: 'a'.repeat(64), observedAt: '2026-10-08T08:57:12.937458Z' } };
  const protocol = fixture('execution-price.raw-events.json');
  protocol.history = { basis: 'fixed-provider-snapshot' }; protocol.marketRuleResearch = 'raw-prices-no-corporate-actions-v1';
  const config = { executionModel: backtestExecutionModelSchemaV3.parse(model),
    executionPriceProtocol: executionPriceProtocolSchema.parse(protocol), dataAsOf: '2026-10-08T10:00:00Z' } as RunConfigV3;
  const row = { symbol: '00147.HK', market: 'HK', instrumentType: 'STOCK', currency: 'HKD', lotSize: '5000', tickSize: '0.001',
    tradable: false, provider: 'yahoo-hk-share-window', providerRevision: 'qualified-window',
    occurredAt: '2026-10-08T08:57:12.937458Z', availableAt: '2026-10-08T08:57:12.937458Z' };
  return { config, row, fees: config.executionModel!.segments[0]!.fees! };
}
describe('港股冻结每手研究坐标', () => {
  it('手动覆盖只改变执行坐标，原始来源值和时钟保持', () => {
    const { config, row } = input('1000'), original = structuredClone(row);
    const fact = instrumentFact(row, false, hkResearchLotForFactV3(row, config));
    expect(fact.lotSize).toBe('1000'); expect(fact.provider).toBe('research-lot-size-configuration');
    expect(fact.occurredAt).toBe(row.occurredAt); expect(row).toEqual(original);
    expect(config.executionModel?.researchLotSize?.defaultSharesPerLot).toBe('5000');
  });
  it('缺预设、默认值不匹配、其他来源和未来观察不能采用', () => {
    const { config, row } = input();
    const missing = structuredClone(config); delete missing.executionModel!.researchLotSize;
    expect(() => hkResearchLotForFactV3(row, missing)).toThrow('每手研究预设');
    expect(() => hkResearchLotForFactV3({ ...row, lotSize: '100' }, config)).toThrow('每手研究预设');
    expect(() => hkResearchLotForFactV3({ ...row, provider: 'yfinance' }, config)).toThrow('每手研究预设');
    expect(() => hkResearchLotForFactV3(row, { ...config, dataAsOf: '2026-10-08T08:00:00Z' })).toThrow('冻结截点');
  });
  it('研究时钟仍要求精确冻结来源请求，未绑定和未来事实拒绝', () => {
    const { config, row } = input();
    const request = { identityOnly: true, symbol: '00147.HK', market: 'HK', barAdjustment: 'none',
      barProviderId: 'yfinance', barUpstreamSource: 'yahoo-hk-share-window' };
    const evidence = [{ purpose: 'instrumentFacts', artifactKey: 'instrumentFacts/HK-00147.HK.parquet',
      sourceResponse: '{}', request: JSON.stringify(request) }];
    const check = (fact = row, proof = evidence) => applicableInstrumentObservationV3(fact, '2025-08-08T01:30:00Z', config, '00147.HK', 'HK', proof);
    expect(check()).toBe(true); expect(check(row, [])).toBe(false);
    expect(check({ ...row, availableAt: '2026-10-08T11:00:00Z' })).toBe(false);
    expect(check(row, [{ ...evidence[0]!, request: JSON.stringify({ ...request, barUpstreamSource: 'yfinance' }) }])).toBe(false);
  });
  it('整手基准包含最低费和印花税进位，覆盖值影响资金资格', () => {
    const { fees } = input();
    const budget = { initialCash: '1000', firstClose: '0.203', lastClose: '0.305', slippageRate: '0', currency: 'HKD' as const, buyFees: fees, sellFees: fees };
    expect(calculateWholeShareBenchmarkReturnV3(budget, { sharesPerLot: '5000', currency: 'HKD', priceScale: '1000' })).toEqual(
      { status: 'unavailable', reason: 'BENCHMARK_INSUFFICIENT_CASH' });
    expect(calculateWholeShareBenchmarkReturnV3(budget, { sharesPerLot: '1000', currency: 'HKD', priceScale: '1000' })).toMatchObject({
      status: 'available', quantity: '4000', buyGross: '812', buyFees: '19', residualCash: '169',
      sellGross: '1220', sellFees: '20', finalCash: '1369', value: '0.369' });
  });
  it('新港股成本和预热范围仅绑定精确原价来源，旧版本不回填', () => {
    const { config } = input();
    const source = { purpose: 'execution', symbol: '00147.HK', routeKey: { kind: 'bar', market: 'HK', assetType: 'STOCK', timeframe: '1d', adjustment: 'none' },
      provenance: { providerId: 'yfinance', upstreamSource: 'yahoo-hk-share-window' } } as BacktestSnapshotManifestV3['actualSources'][number];
    const manifest = { actualSources: [source], benchmarkCostVersion: researchLotShareWindowBenchmarkCostVersionV3 } as BacktestSnapshotManifestV3;
    expect(hkResearchLotForSourceV3(source, config)?.sharesPerLot).toBe('5000');
    const missing = structuredClone(config); delete missing.executionModel!.researchLotSize;
    expect(() => hkResearchLotForSourceV3(source, missing)).toThrow('每手股数预设');
    expect(() => hkResearchLotForSourceV3({ ...source, symbol: '00700.HK' }, config)).toThrow('未绑定');
    expect(shareWindowBenchmarkCostVersionV3(config.executionPriceProtocol, source)).toBe(researchLotShareWindowBenchmarkCostVersionV3);
    expect(supportsWholeShareWindowBenchmarkV3(config.executionPriceProtocol, manifest)).toBe(true);
    expect(supportsWholeShareWindowBenchmarkV3(config.executionPriceProtocol, { ...manifest, benchmarkCostVersion: benchmarkExecutionModelCostVersionV3 })).toBe(false);
    expect(shareWindowBenchmarkCostVersionV3(config.executionPriceProtocol, { ...source, symbol: '00700.HK' })).toBe(benchmarkExecutionModelCostVersionV3);
    expect(shareWindowWarmupPolicyV3({ executionInstrument: { symbol: '00147.HK', market: 'HK', assetType: 'stock' } }, 'raw-prices-no-corporate-actions-v1').calendarBufferDays).toBe(0);
  });
});


it('独立每手来源不受价格包旧默认值限制，但仍绑定标的和研究时钟', () => {
  const { config, row } = input('100');
  config.executionModel!.researchLotSize = {
    ...config.executionModel!.researchLotSize!, sharesPerLot: '100', defaultSharesPerLot: '100', origin: 'providerCurrent',
    source: { ...config.executionModel!.researchLotSize!.source, symbol: '00147.HK', provider: 'futu' },
  };
  const original = structuredClone(row);
  expect(hkResearchLotForFactV3(row, config)?.sharesPerLot).toBe('100');
  expect(row).toEqual(original);
  config.executionModel!.researchLotSize!.source.symbol = '00700.HK';
  expect(() => hkResearchLotForFactV3(row, config)).toThrow('每手研究预设');
});
