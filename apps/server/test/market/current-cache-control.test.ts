import { expect, it, vi } from 'vitest';
import { MarketService } from '../../src/market/market.service.js';
import { quoteControlFixture } from './quote-control-fixture.js';

const time = '2026-10-01T00:00:00Z';
const nav = { version: 3, symbol: '000001.OF', unitNav: 1.1, navDate: time,
  fetchedAt: time, provider: 'fixture', freshness: 'delayed' };
const holdings = { version: 3, fundSymbol: nav.symbol, reportPeriod: '2026-Q3', disclosureDate: null,
  fetchedAt: time, provider: 'fixture', evidenceVersion: 'fixture', holdings: [] };
const chip = { version: 3, symbol: '600519.SH', averageCost: 10, profitRatio: 0.5,
  range70: [9, 11], range90: [8, 12], concentration: 0.5,
  provider: 'fixture', engineVersion: 'fixture', calculatedAt: time };
const cases = [
  { capability: 'FUND_NAV', value: nav, read: (s: MarketService) => s.getFundNav(nav.symbol) },
  { capability: 'FUND_NAV_HISTORY', value: [nav], read: (s: MarketService) =>
    s.getFundNavHistory(nav.symbol, {}, { persistIdentity: false }) },
  { capability: 'FUND_HOLDINGS', value: holdings, read: (s: MarketService) => s.getFundHoldings(nav.symbol) },
  { capability: 'CHIP_SUMMARY', value: chip, read: (s: MarketService) => s.getChip(chip.symbol) },
];

function harness(value: unknown) {
  const state = { generation: 'a'.repeat(64), ready: true };
  const values = new Map<string, string>();
  const dsa = { get: vi.fn(async () => value), marketCacheContextV3: vi.fn(async (request) => ({
    ...await quoteControlFixture(request), generation: state.generation,
    ready: state.ready, reason: state.ready ? null : 'disabled',
  })) };
  const client = { get: vi.fn(async (key: string) => values.get(key) ?? null),
    set: vi.fn(async (key: string, serialized: string, mode?: string) => {
      if (mode === 'EX') values.set(key, serialized);
      return 'OK';
    }), eval: vi.fn(async () => 1), multi: () => {
      const writes: [string, string][] = [];
      const chain = { set: (key: string, serialized: string) => {
        writes.push([key, serialized]); return chain;
      }, exec: async () => { for (const [key, serialized] of writes) values.set(key, serialized); } };
      return chain;
    } };
  return { state, values, dsa, client, service: new MarketService(dsa as never, { client } as never) };
}

it.each(cases)('$capability fresh命中仍校验控制，关闭后零数据请求', async (item) => {
  const h = harness(item.value);
  await item.read(h.service); await item.read(h.service);
  expect(h.dsa.get).toHaveBeenCalledOnce();
  h.state.ready = false;
  await expect(item.read(h.service)).rejects.toMatchObject({ code: 'control-rejected' });
  expect(h.dsa.get).toHaveBeenCalledOnce();
});

it.each(cases)('$capability 新代次不读旧fresh或last-valid', async (item) => {
  const h = harness(item.value);
  await item.read(h.service);
  h.state.generation = 'b'.repeat(64);
  h.dsa.get.mockRejectedValue(new Error('数据失败'));
  await expect(item.read(h.service)).rejects.toThrow('数据失败');
  expect(h.dsa.get).toHaveBeenCalledTimes(2);
  expect(h.values.size).toBeGreaterThan(0); // 原代次缓存保留，不删旧资产。
});

it.each(cases)('$capability 晚到结果不能写缓存或返回', async (item) => {
  const h = harness(item.value);
  h.dsa.get.mockImplementation(async () => { h.state.generation = 'b'.repeat(64); return item.value; });
  await expect(item.read(h.service)).rejects.toMatchObject({ code: 'stale-revision' });
  expect(h.values.size).toBe(0);
  expect(h.dsa.get).toHaveBeenCalledOnce();
});
