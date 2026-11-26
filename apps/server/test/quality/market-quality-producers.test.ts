import { describe, expect, it, vi } from 'vitest';
import { DsaError } from '../../src/integration/dsa/dsa.client.js';
import { MarketPeriodCalendarReader } from '../../src/market/market-period-calendar-reader.js';
import { redisKey } from '../../src/platform/redis.service.js';
import { quoteControlCacheKey } from '../market/quote-control-fixture.js';
import { qualityMarketFixture, quoteFixture, navFixture } from './market-quality-fixture.js';

describe('真实行情读取器自动记录', () => {
  it('正常报价和上一交易日基金净值不生成质量问题', async () => {
    const observe = vi.fn(async () => null);
    const h = qualityMarketFixture({ observe });
    h.dsa.get.mockResolvedValue(quoteFixture);
    await expect(h.service.getQuote('600519.SH', { refresh: true })).resolves.toMatchObject({
      price: 10,
    });
    h.dsa.get.mockResolvedValue(navFixture);
    await expect(h.service.getFundNav('000001.OF', { refresh: true })).resolves.toMatchObject({
      unitNav: 1.1,
      freshness: 'delayed',
    });
    expect(observe).not.toHaveBeenCalled();
  });
  it('来源报价格式错误，降级成功也保留异常观察', async () => {
    const observe = vi.fn(async () => null);
    const h = qualityMarketFixture({ observe });
    h.values.set(
      redisKey('cache', `${quoteControlCacheKey('600519.SH')}:last-valid`),
      JSON.stringify(quoteFixture),
    );
    await expect(h.service.getQuote('600519.SH', { refresh: true })).resolves.toMatchObject({
      servedFromCache: true,
    });
    expect(observe).toHaveBeenCalledWith(
      expect.objectContaining({
        capability: 'REALTIME_QUOTE',
        symbol: '600519.SH',
        provider: 'dsa',
        code: 'response_schema_invalid',
      }),
    );
    expect(h.dsa.get).toHaveBeenCalledTimes(1);
  });
  it('来源返回不同标的记录身份错误，不保存来源正文', async () => {
    const observe = vi.fn(async () => null);
    const h = qualityMarketFixture({ observe });
    h.dsa.get.mockResolvedValue({ ...quoteFixture, symbol: '000001.SZ', token: 'secret' });
    await expect(h.service.getQuote('600519.SH', { refresh: true })).rejects.toThrow();
    expect(observe).toHaveBeenCalledWith(
      expect.objectContaining({ symbol: '600519.SH', code: 'response_identity_mismatch' }),
    );
    expect(JSON.stringify(observe.mock.calls)).not.toContain('secret');
  });
  it('来源超时、非法请求不记录数据质量问题', async () => {
    const observe = vi.fn(async () => null);
    const h = qualityMarketFixture({ observe });
    h.dsa.get.mockRejectedValue(new DsaError('timeout', 'timeout'));
    await expect(h.service.getQuote('600519.SH', { refresh: true })).rejects.toThrow();
    await expect(h.service.getFundNav('invalid')).rejects.toThrow();
    expect(observe).not.toHaveBeenCalled();
  });
  it('当前净值、历史净值和持仓的原校验接入日志', async () => {
    const observe = vi.fn(async () => null);
    const h = qualityMarketFixture({ observe });
    await expect(h.service.getFundNav('000001.OF', { refresh: true })).rejects.toThrow();
    expect(observe).toHaveBeenLastCalledWith(
      expect.objectContaining({ capability: 'FUND_NAV', code: 'response_schema_invalid' }),
    );
    h.dsa.get.mockResolvedValue([{ ...navFixture, symbol: '000002.OF' }]);
    await expect(h.service.getFundNavHistory('000001.OF', {}, { refresh: true })).rejects.toThrow(
      '基金净值历史响应代码与请求不一致',
    );
    expect(observe).toHaveBeenLastCalledWith(
      expect.objectContaining({
        capability: 'FUND_NAV_HISTORY',
        code: 'response_identity_mismatch',
      }),
    );
    h.dsa.get.mockResolvedValue({ unexpected: true });
    await expect(h.service.getFundNavHistory('000001.OF', {}, { refresh: true })).rejects.toThrow();
    expect(observe).toHaveBeenLastCalledWith(
      expect.objectContaining({ capability: 'FUND_NAV_HISTORY', code: 'response_schema_invalid' }),
    );
    h.dsa.get.mockResolvedValue({ version: 3 });
    await expect(h.service.getFundHoldings('000001.OF', { refresh: true })).rejects.toThrow();
    expect(observe).toHaveBeenLastCalledWith(
      expect.objectContaining({ capability: 'FUND_HOLDINGS', code: 'response_schema_invalid' }),
    );
  });
  it('实际日历覆盖不足记录问题，输入错误和来源不可用不记录', async () => {
    const observe = vi.fn(async () => null);
    const marketCalendar = vi.fn(async () => ({
      version: 1,
      status: 'supported',
      coverage: { start: '2026-09-21', end: '2026-09-27', complete: false },
      provider: 'fixture',
      providerRevision: 'v1',
      facts: [],
      reason: null,
    }));
    const reader = new MarketPeriodCalendarReader(
      { marketCalendar } as never,
      { observe } as never,
    );
    const input = {
      market: 'CN' as const,
      start: '2026-09-21',
      end: '2026-09-27',
      evaluationAsOf: '2026-09-28T00:00:00Z',
    };
    expect(await reader.read(input)).toMatchObject({
      status: 'unavailable',
      reason: 'calendar_incomplete',
    });
    expect(observe).toHaveBeenCalledWith({
      capability: 'TRADING_CALENDAR',
      provider: 'dsa',
      scope: 'CN',
      code: 'calendar_incomplete',
    });
    observe.mockClear();
    await reader.read({ ...input, start: 'invalid' });
    marketCalendar.mockRejectedValue(new DsaError('offline', 'unavailable'));
    await reader.read(input);
    expect(observe).not.toHaveBeenCalled();
  });
});
