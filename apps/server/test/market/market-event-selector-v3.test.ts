import { describe, expect, it, vi } from 'vitest';
import { selectMarketEventV3 } from '../../src/market/market-event-selector-v3.js';
import type { MarketEventSelectionInputV3 } from '../../src/market/market-event-selector-v3.js';

function fixture() {
  const key = { kind: 'data', market: 'CN', assetType: 'ETF', capability: 'CASH_DISTRIBUTION' } as const;
  const primary = { providerId: 'akshare', upstreamSource: 'eastmoney' };
  const secondary = { providerId: 'other', upstreamSource: 'other-source' };
  const scope: MarketEventSelectionInputV3['scope'] = {
    contractVersion: 3, requestId: 'event-1', symbol: '510300.SH', routeKey: key,
    desiredRevision: 2, effectivePolicyRevision: 2, catalogRevision: 3,
    start: '2025-01-01', end: '2025-12-31', dataAsOf: '2026-09-27T01:00:00Z',
  };
  const effective = {
    contractVersion: 3, consumer: 'thesis-ledger', requestId: 'policy-1', revision: 2,
    sourceDesiredRevision: 2, enabled: true, appliedAt: '2026-09-26T00:00:00Z',
    routes: [{ key, reason: null, targets: [
      { ...primary, routeIndex: 0, eligible: true, reason: null },
      { ...secondary, routeIndex: 1, eligible: true, reason: null },
    ] }],
  };
  const catalog = {
    contractVersion: 3, consumer: 'thesis-ledger', catalogRevision: 3,
    generatedAt: '2026-09-26T00:00:00Z', integrity: 'complete',
    entries: [primary, secondary].map((target) => ({ key, target, state: 'ready' })),
  };
  const read = vi.fn(async (request: Parameters<MarketEventSelectionInputV3['read']>[0]) => ({
    ...request, fetchedAt: '2026-09-27T00:00:00Z', providerRevision: 'source-1', facts: [],
    coverage: { complete: false, reason: 'historical_coverage_unverified' },
  }));
  return { scope, effective, catalog, read };
}

describe('事件精确来源选择', () => {
  it('保留原始请求响应，传输成功不授予覆盖完整性', async () => {
    const input = fixture();
    const result = await selectMarketEventV3(input);
    expect(result.status).toBe('observed');
    if (result.status !== 'observed') throw new Error('缺少观测');
    expect(result.request.routeTarget).toEqual({ providerId: 'akshare', upstreamSource: 'eastmoney', routeIndex: 0 });
    expect(result.response.coverage.complete).toBe(false);
    expect(result.response).toEqual(await input.read.mock.results[0]!.value);
    expect(input.read).toHaveBeenCalledOnce();
  });

  it.each(['revision', 'sourceDesiredRevision'] as const)('拒绝策略 %s 漂移', async (field) => {
    const input = fixture();
    input.effective[field] = 4;
    expect(await selectMarketEventV3(input)).toEqual({ status: 'unavailable', reason: 'policy_mismatch' });
    expect(input.read).not.toHaveBeenCalled();
  });

  it.each(['partial', 'revision'])('拒绝目录 %s', async (mode) => {
    const input = fixture();
    if (mode === 'partial') input.catalog.integrity = 'partial';
    else input.catalog.catalogRevision = 4;
    expect(await selectMarketEventV3(input)).toEqual({ status: 'unavailable', reason: 'catalog_unavailable' });
    expect(input.read).not.toHaveBeenCalled();
  });

  it('分红路由不能用于拆分，拒绝请求前的能力错配', async () => {
    const input = fixture();
    input.scope.routeKey = { ...input.scope.routeKey, capability: 'SPLIT_EVENT' };
    expect(await selectMarketEventV3(input)).toEqual({ status: 'unavailable', reason: 'not_admitted' });
    expect(input.read).not.toHaveBeenCalled();
  });

  it('仅选择同一精确路由已就绪的备源', async () => {
    const input = fixture();
    input.catalog.entries[0]!.state = 'not_admitted';
    const result = await selectMarketEventV3(input);
    expect(result).toMatchObject({ status: 'observed', request: { routeTarget: { routeIndex: 1, providerId: 'other' } } });
    expect(input.read).toHaveBeenCalledOnce();
  });

  it('上游失败不隐式重试或更换来源', async () => {
    const input = fixture();
    input.read.mockRejectedValue(new Error('不可用'));
    expect(await selectMarketEventV3(input)).toMatchObject({ status: 'unavailable', reason: 'upstream_failure',
      request: { routeTarget: { providerId: 'akshare', upstreamSource: 'eastmoney', routeIndex: 0 } } });
    expect(input.read).toHaveBeenCalledOnce();
  });

  it('拒绝来源回显错配', async () => {
    const input = fixture();
    input.read.mockImplementation(async (request) => ({
      ...request, requestId: 'another-request', fetchedAt: '2026-09-27T00:00:00Z',
      providerRevision: 'source-1', facts: [], coverage: { complete: false, reason: 'unknown' },
    }));
    expect(await selectMarketEventV3(input)).toMatchObject({ status: 'unavailable', reason: 'invalid_response',
      request: { requestId: input.scope.requestId, routeTarget: { providerId: 'akshare' } } });
  });
});
