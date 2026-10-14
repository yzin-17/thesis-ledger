import { describe, expect, it, vi } from 'vitest';
import { MarketControlService } from '../src/market/market-control.service.js';
const route = {
  key: {
    kind: 'bar',
    market: 'CN',
    assetType: 'ETF',
    capability: 'DAILY_BAR',
    timeframe: '1d',
    adjustment: 'qfq',
  },
  target: { providerId: 'hithink', upstreamSource: 'fund-market-historical' },
};

describe('来源精确检查透传', () => {
  it('账户访问检查保留独立用途，不套用业务读取目标', async () => {
    const dsa = { testControlProvider: vi.fn(async () => ({})) };
    const service = new MarketControlService({} as never, dsa as never);
    await service.testProvider('tushare', { requestId: 'account', purpose: 'account_access' });
    expect(dsa.testControlProvider).toHaveBeenCalledWith('tushare', { requestId: 'account', purpose: 'account_access' });
    expect(() => service.testProvider('tushare', { purpose: 'all_permissions' })).toThrow();
  });
  it('保留用户选择的完整精确目标', async () => {
    const dsa = { testControlProvider: vi.fn(async () => ({})) };
    await new MarketControlService({} as never, dsa as never).testProvider('hithink', {
      requestId: 'precise',
      route,
    });
    expect(dsa.testControlProvider).toHaveBeenCalledWith('hithink', {
      requestId: 'precise',
      route,
    });
  });
  it('拒绝宽能力字段和非法精确请求', () => {
    const dsa = { testControlProvider: vi.fn() };
    const service = new MarketControlService({} as never, dsa as never);
    expect(() => service.testProvider('hithink', { capabilities: ['DAILY_BAR'] })).toThrow();
    expect(() =>
      service.testProvider('hithink', {
        route: { ...route, key: { ...route.key, market: 'other' } },
      }),
    ).toThrow();
    expect(dsa.testControlProvider).not.toHaveBeenCalled();
  });
});
