import { expect, it, vi } from 'vitest';
import { MarketActionCoverage } from '../../src/market/market-action-coverage.js';
import { selectMarketEventV3 } from '../../src/market/market-event-selector-v3.js';

vi.mock('../../src/market/market-event-selector-v3.js', () => ({ selectMarketEventV3: vi.fn() }));
const input = {
  symbol: '510300.SH',
  assetType: 'ETF' as const,
  market: 'CN' as const,
  previousDay: '2026-11-20',
  now: new Date('2026-11-23T02:00:00Z'),
};
function reader() {
  return new MarketActionCoverage({
    effectiveControlPolicyV3: vi
      .fn()
      .mockResolvedValue({ projection: { effective: { revision: 1, sourceDesiredRevision: 1 } } }),
    marketRouteCatalogV3: vi.fn().mockResolvedValue({ catalogRevision: 1 }),
    marketEventsV3: vi.fn(),
  } as never);
}
it('不完整公司行动默认无事件；已知事件仍阻断受影响标的', async () => {
  vi.mocked(selectMarketEventV3).mockResolvedValue({
    status: 'observed',
    response: {
      facts: [],
      coverage: { complete: false },
    },
  } as never);
  const result = await reader().read(input, '2026-11-23', 'sampled-v1');
  expect(result).toEqual([
    'CASH_DISTRIBUTION:coverage_unverified',
    'SPLIT_EVENT:coverage_unverified',
  ]);
  expect(await reader().read(input, '2026-11-23')).toBeNull();
  vi.mocked(selectMarketEventV3).mockResolvedValue({
    status: 'observed',
    response: {
      facts: [{ kind: 'split' }],
      coverage: { complete: false },
    },
  } as never);
  expect(await reader().read(input, '2026-11-23', 'sampled-v1')).toBeNull();
});
it('来源读取失败属于覆盖不完整，研究默认不要求完整无事件证明', async () => {
  const value = new MarketActionCoverage({
    effectiveControlPolicyV3: vi.fn().mockRejectedValue(new Error('offline')),
    marketRouteCatalogV3: vi.fn().mockResolvedValue({}),
  } as never);
  expect(await value.read(input, '2026-11-23', 'sampled-v1')).toEqual([
    'corporate_actions:coverage_unverified',
  ]);
});
