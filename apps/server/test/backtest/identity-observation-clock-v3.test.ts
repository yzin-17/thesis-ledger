import { describe, expect, it } from 'vitest';
import { applicableInstrumentObservationV3 } from '../../src/backtest/backtest-identity-observation-clock-v3.js';
import { tradingStatusRunConfig } from './trading-status-fixtures.js';
const fact = { symbol: 'GME.US', market: 'US', occurredAt: '2026-10-07T07:52:08Z', availableAt: '2026-10-07T07:52:08Z' };
const evidence = [{ purpose: 'instrumentFacts', artifactKey: 'instrumentFacts/US-GME.US.parquet',
  sourceResponse: '{}', request: JSON.stringify({ symbol: 'GME.US', market: 'US', identityOnly: true }) }];
describe('当前身份观察与历史适用性时钟分离', () => {
  it('固定归一化且带身份读取证明时保留原时钟，截点之后仍拒绝', async () => {
    const config = await tradingStatusRunConfig();
    config.executionPriceProtocol.accountingBasis = 'normalized-series';
    config.executionPriceProtocol.history = { basis: 'fixed-provider-snapshot' };
    config.dataAsOf = '2026-10-07T10:00:00Z';
    expect(applicableInstrumentObservationV3(fact, '2024-05-10T13:30:00Z', config, 'GME.US', 'US', evidence)).toBe(true);
    expect(fact.occurredAt).toBe('2026-10-07T07:52:08Z');
    expect(applicableInstrumentObservationV3({ ...fact, availableAt: '2026-10-08T00:00:00Z' }, '2024-05-10T13:30:00Z', config, 'GME.US', 'US', evidence)).toBe(false);
    expect(applicableInstrumentObservationV3(fact, '2024-05-10T13:30:00Z', config, 'OTHER.US', 'US', evidence)).toBe(false);
    expect(applicableInstrumentObservationV3(fact, '2024-05-10T13:30:00Z', config, 'GME.US', 'US', [])).toBe(false);
  });
  it('原价、严格PIT及旧无研究配置不借观察证明获得历史适用性', async () => {
    const config = await tradingStatusRunConfig();
    expect(applicableInstrumentObservationV3(fact, '2024-05-10T13:30:00Z', config, 'GME.US', 'US', evidence)).toBe(false);
    config.executionPriceProtocol.accountingBasis = 'normalized-series';
    config.executionPriceProtocol.history = { basis: 'point-in-time', reconstructionEvidenceRef: 'strict' };
    expect(applicableInstrumentObservationV3(fact, '2024-05-10T13:30:00Z', config, 'GME.US', 'US', evidence)).toBe(false);
    expect(applicableInstrumentObservationV3(fact, '2024-05-10T13:30:00Z', undefined, 'GME.US', 'US', evidence)).toBe(false);
  });
});
