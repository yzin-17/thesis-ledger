import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { RunConfigV3 } from '@thesis-ledger/schemas';
import { applicableInstrumentObservationV3 } from '../../src/backtest/backtest-identity-observation-clock-v3.js';

function input() {
  const protocol = JSON.parse(readFileSync(new URL(
    '../../../../packages/schemas/fixtures/execution-price.raw-events.json', import.meta.url,
  ), 'utf8'));
  protocol.history = { basis: 'fixed-provider-snapshot' };
  protocol.marketRuleResearch = 'raw-prices-no-corporate-actions-v1';
  const config = { executionPriceProtocol: protocol, dataAsOf: '2026-10-08T06:00:00Z' } as RunConfigV3;
  const fact = { symbol: 'GME.US', market: 'US', instrumentType: 'STOCK', currency: 'USD',
    provider: 'yahoo-gme-share-window', lotSize: '1', tickSize: '0.01',
    occurredAt: '2026-10-08T05:00:13.996180+00:00', availableAt: '2026-10-08T05:00:13.996180+00:00' };
  const request = { identityOnly: true, symbol: 'GME.US', market: 'US', barAdjustment: 'none',
    barProviderId: 'yfinance', barUpstreamSource: 'yahoo-gme-share-window' };
  const evidence = [{ purpose: 'instrumentFacts', artifactKey: 'instrumentFacts/US-GME.US.parquet',
    sourceResponse: '{}', request: JSON.stringify(request) }];
  return { config, fact, request, evidence };
}
describe('有界整股身份观察的研究时钟', () => {
  it('匹配冻结来源请求才使用dataAsOf，事实发生和可见时钟原样保留', () => {
    const { config, fact, evidence } = input();
    const original = structuredClone(fact);
    expect(applicableInstrumentObservationV3(fact, '2024-05-14T13:30:00Z', config, 'GME.US', 'US', evidence)).toBe(true);
    expect(fact).toEqual(original);
  });
  it('缺绑定、普通原价、错误来源/单位和晚于研究截点都拒绝', () => {
    const { config, fact, request, evidence } = input();
    const check = (value = fact, settings = config, proof = evidence) =>
      applicableInstrumentObservationV3(value, '2024-05-14T13:30:00Z', settings, 'GME.US', 'US', proof);
    expect(check(fact, config, [])).toBe(false);
    const ordinary = structuredClone(config); delete ordinary.executionPriceProtocol.marketRuleResearch;
    expect(check(fact, ordinary)).toBe(false);
    expect(check({ ...fact, provider: 'unverified' })).toBe(false);
    expect(check({ ...fact, lotSize: '100' })).toBe(false);
    expect(check({ ...fact, availableAt: '2026-10-08T07:00:00Z' })).toBe(false);
    expect(check(fact, config, [{ ...evidence[0]!, request: JSON.stringify({ ...request, barUpstreamSource: 'yfinance' }) }])).toBe(false);
  });
});
