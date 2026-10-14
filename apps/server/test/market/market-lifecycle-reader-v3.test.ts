import { describe, expect, it, vi } from 'vitest';
import { MarketLifecycleReaderV3 } from '../../src/market/market-lifecycle-reader-v3.js';
import { lifecycleResponseFixtureV3 } from './lifecycle-response.fixture.js';
const scope = {
  market: 'CN' as const,
  symbol: '000995.SZ',
  start: '2026-05-01',
  end: '2026-05-22',
};
describe('标准生命周期能力读取与现行路由', () => {
  it('只读取所选目标，返回实际基础日期；不保存配置', async () => {
    const response = lifecycleResponseFixtureV3(scope.symbol, scope.start, scope.end, '2026-05-18');
    const policy = {
      enabled: true,
      routes: [{ key: response.routeKey, targets: [{ ...response.routeTarget, eligible: true }] }],
    };
    const dsa = {
      effectiveControlPolicyV3: vi.fn(async () => ({ projection: { effective: policy } })),
      marketTradingStatusV3: vi.fn(async () => response),
    };
    expect(await new MarketLifecycleReaderV3(dsa as never).read(scope)).toEqual(response);
    expect(dsa.marketTradingStatusV3).toHaveBeenCalledOnce();
    expect(dsa.marketTradingStatusV3).toHaveBeenCalledWith(
      expect.objectContaining({
        symbol: scope.symbol,
        range: { start: scope.start, end: scope.end },
        routeTarget: response.routeTarget,
      }),
    );
  });
  it('追踪包装变化不冒充实际路由变化', async () => {
    const response = lifecycleResponseFixtureV3(scope.symbol, scope.start, scope.end, '2026-05-18');
    const policy = { revision: 74, sourceDesiredRevision: 74, enabled: true, routes: [{ key: response.routeKey, targets: [{ ...response.routeTarget, eligible: true }] }] };
    const dsa = { effectiveControlPolicyV3: vi.fn().mockResolvedValueOnce({ projection: { effective: { ...policy, requestId: 'first', appliedAt: '2026-10-09T10:00:00Z' } } }).mockResolvedValueOnce({ projection: { effective: { ...policy, requestId: 'second', appliedAt: '2026-10-09T10:00:01Z' } } }), marketTradingStatusV3: vi.fn(async () => response) };
    await expect(new MarketLifecycleReaderV3(dsa as never).read(scope)).resolves.toEqual(response);
  });
  it('来源读取期间有效路由变化时拒绝，不用晚到响应', async () => {
    const response = lifecycleResponseFixtureV3(scope.symbol, scope.start, scope.end, '2026-05-18');
    const policy = {
      enabled: true,
      routes: [{ key: response.routeKey, targets: [{ ...response.routeTarget, eligible: true }] }],
    };
    const dsa = {
      effectiveControlPolicyV3: vi
        .fn()
        .mockResolvedValueOnce({ projection: { effective: policy } })
        .mockResolvedValueOnce({ projection: { effective: { ...policy, enabled: false } } }),
      marketTradingStatusV3: vi.fn(async () => response),
    };
    await expect(new MarketLifecycleReaderV3(dsa as never).read(scope)).rejects.toThrow(
      '有效路由变化',
    );
  });
});
