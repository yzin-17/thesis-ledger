import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  executionPriceProtocolSchema, backtestSnapshotManifestV3Schema,
  benchmarkExecutionModelCostVersionV3, wholeShareWindowBenchmarkCostVersionV3,
  type BacktestSnapshotManifestV3,
} from '@thesis-ledger/schemas';
import { calculateWholeShareBenchmarkReturnV3 } from '../../src/backtest/backtest-whole-share-benchmark-cost-v3.js';
import { shareWindowBenchmarkCostVersionV3 } from '../../src/backtest/backtest-share-window-benchmark-profile-v3.js';
import { researchBenchmarkLimitV3 } from '../../src/backtest/backtest-research-benchmark-limit-v3.js';

const fixture = (name: string) => JSON.parse(readFileSync(
  new URL(`../../../../packages/schemas/fixtures/${name}`, import.meta.url), 'utf8',
));
function input() {
  const model = fixture('backtest-execution-model.cn-2024q1.json');
  const fees = model.segments[0].fees;
  fees.currency = 'USD';
  fees.commission = { ...fees.commission, currency: 'USD', rate: '0', minimum: { kind: 'none' } };
  for (const code of ['stampDuty', 'transferFee', 'handlingFee'])
    fees[code] = { treatment: 'notApplicable', reason: '本窗口未纳入该项' };
  fees.regulatoryFee = { ...fees.commission, side: 'sell', rate: '0.0000278' };
  const broker = fixture('backtest-broker-commission.futu.json').US;
  broker.basis = { kind: 'actualShares' };
  fees.brokerCommission = broker;
  fees.tradingActivityFee = { treatment: 'charged', side: 'sell', basis: 'actualShares', currency: 'USD',
    rate: '0.000166', minimum: { kind: 'none' }, maximumAmount: '8.30', lowPriceExemption: 'belowPerShareRate' };
  return { initialCash: '100000', firstClose: '48.75', lastClose: '19', slippageRate: '0',
    currency: 'USD' as const, buyFees: fees, sellFees: fees };
}
describe('美股按股基准冻结版本', () => {
  it('费用纳入最大整数股预算，保留余款，末日按股费用进入净收益', () => {
    const result = calculateWholeShareBenchmarkReturnV3(input());
    expect(result).toMatchObject({ status: 'available', quantity: '2050', buyGross: '99937.5',
      buyFees: '20.3', buyDebit: '99957.8', residualCash: '42.2', sellGross: '38950',
      sellFees: '21.72', finalCash: '38970.48', value: '-0.6102952' });
  });
  it('资金不足不虚构零股，非零滑点和不符合网格的价格不开放', () => {
    expect(calculateWholeShareBenchmarkReturnV3({ ...input(), initialCash: '49' }).status).toBe('unavailable');
    expect(calculateWholeShareBenchmarkReturnV3({ ...input(), slippageRate: '0.001' }).status).toBe('unavailable');
    expect(calculateWholeShareBenchmarkReturnV3({ ...input(), firstClose: '48.755' }).status).toBe('unavailable');
  });
  it('只有新精确来源与新版本同时满足才解除原价研究基准限制', () => {
    const raw = fixture('execution-price.raw-events.json');
    raw.history = { basis: 'fixed-provider-snapshot' };
    raw.marketRuleResearch = 'raw-prices-no-corporate-actions-v1';
    const protocol = executionPriceProtocolSchema.parse(raw);
    const source = { purpose: 'execution', symbol: 'GME.US',
      routeKey: { kind: 'bar', market: 'US', assetType: 'STOCK', timeframe: '1d', adjustment: 'none' },
      provenance: { providerId: 'yfinance', upstreamSource: 'yahoo-gme-share-window' },
    } as BacktestSnapshotManifestV3['actualSources'][number];
    const manifest = { actualSources: [source], benchmarkCostVersion: wholeShareWindowBenchmarkCostVersionV3 } as BacktestSnapshotManifestV3;
    expect(shareWindowBenchmarkCostVersionV3(protocol, source)).toBe(wholeShareWindowBenchmarkCostVersionV3);
    expect(researchBenchmarkLimitV3(protocol, manifest)).toBeUndefined();
    expect(researchBenchmarkLimitV3(protocol, { ...manifest, benchmarkCostVersion: benchmarkExecutionModelCostVersionV3 })).toBeDefined();
    expect(researchBenchmarkLimitV3(protocol)).toBeDefined();
    expect(shareWindowBenchmarkCostVersionV3(protocol, { ...source, symbol: 'AAPL.US' })).toBe(benchmarkExecutionModelCostVersionV3);
    expect(researchBenchmarkLimitV3(protocol, { ...manifest, actualSources: [{ ...source,
      provenance: { ...source.provenance, upstreamSource: 'yfinance' } }] })).toBeDefined();
    expect(backtestSnapshotManifestV3Schema.shape.benchmarkCostVersion.safeParse(wholeShareWindowBenchmarkCostVersionV3).success).toBe(true);
    expect(backtestSnapshotManifestV3Schema.shape.benchmarkCostVersion.safeParse('arbitrary-version').success).toBe(false);
  });
});
