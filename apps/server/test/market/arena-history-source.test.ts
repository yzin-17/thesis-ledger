import { describe, it, expect, vi } from 'vitest';
import { MarketArenaHistorySource } from '../../src/market/market-arena-history-source.js';
import { readArenaHistoryMinutes, readArenaHistoryInstruments } from '../../src/integration/dsa/dsa-arena-history.js';
import { liveProtocolFixture } from '../model-arena/live-fixture.js';

const stamp = '2026-11-02T01:30:00.000Z';
const raw = { contractVersion: 3 as const, consumer: 'thesis-ledger' as const, requestId: 'test',
  kind: 'reconstructed-minutes' as const, date: '2026-11-02', providerId: 'futu', policyRevision: 199,
  archiveRef: `arena-history/${'a'.repeat(64)}.json`, value: { symbol: '600000.SH', assetType: 'STOCK' as const,
    market: 'CN' as const, source: 'futu', timezone: 'Asia/Shanghai' as const, timeframe: '1m' as const, session: 'regular' as const,
    timestampConvention: 'interval-start' as const, observedAt: '2026-11-12T01:00:00.000Z', responseSha256: 'a'.repeat(64),
    fieldUnits: { volume: 'share' as const, amount: 'CNY' as const },
    rows: [0, 1, 2].map((i) => ({ timestamp: new Date(Date.parse(stamp) + i * 60000).toISOString(), open: 10, high: 10, low: 10, close: 10, volume: 1, amount: 10, complete: true })) } };
describe('历史重建消费者', () => {
  it('AI 精确检索缺录 ETF 时按词读取身份，然后只取该 ETF 的历史；身份不认证历史资格', async () => {
    const discovery = { contractVersion: 3 as const, consumer: 'thesis-ledger' as const, requestId: 'search', kind: 'current-instrument-discovery' as const,
      historicalEligibility: 'unverified' as const, market: 'CN' as const, date: '2026-11-02', query: '510300', providerId: 'hithink' as const,
      providerVersion: 3, observedAt: '2026-11-13T00:00:00Z', sourceTimestamp: 1716105600000, responseSha256: 'b'.repeat(64), archiveRef: `arena-history/${'b'.repeat(64)}.json`,
      items: [{ symbol: '510300.SH', name: '510300.SH', assetType: 'ETF' as const }] };
    const dsa = { arenaHistoryInstruments: vi.fn(async () => discovery), arenaHistoryMinutes: vi.fn(async () => ({ ...raw, value: { ...raw.value, symbol: '510300.SH', assetType: 'ETF' as const } })) };
    const instruments = { search: vi.fn(async () => [{ id: 'wrong', symbol: '600300.SH', canonicalCode: '600300', instrumentType: 'STOCK' }]) as never,
      resolveCanonicalSymbols: vi.fn(async () => ({ items: [], unresolvedSymbols: ['510300.SH'] })) };
    const source = new MarketArenaHistorySource(dsa, instruments), at = '2026-11-02T01:31:00.000Z';
    const p = liveProtocolFixture({ market: 'CN', currency: 'CNY', timeZone: 'Asia/Shanghai' });
    expect(await source.search(p, '510300', at)).toMatchObject([{ symbol: '510300.SH', assetType: 'ETF', identityEvidence: { historicalEligibility: 'unverified' } }]);
    expect(dsa.arenaHistoryMinutes).not.toHaveBeenCalled();
    await source.research(p, at, { symbol: '510300.SH', timeframe: '1m', limit: 20 });
    expect(dsa.arenaHistoryInstruments.mock.calls).toEqual([[{ market: 'CN', date: '2026-11-02', query: '510300' }], [{ market: 'CN', date: '2026-11-02', query: '510300.SH' }]]);
    expect(dsa.arenaHistoryMinutes).toHaveBeenCalledExactlyOnceWith({ market: 'CN', date: '2026-11-02', symbol: '510300.SH', assetType: 'ETF', timeframe: '1m' });
    await expect(readArenaHistoryInstruments(async () => discovery, { market: 'CN', date: '2026-11-02', query: '510300' })).rejects.toThrow('证券身份响应与请求不匹配');
  });
  it('AI 检索只读本地身份，随后仅下载选中证券的历史；未知身份不猜测类型', async () => {
    const id = '11111111-1111-4111-8111-111111111111';
    const dsa = { arenaHistoryMinutes: vi.fn(async () => raw), arenaHistoryCatalog: vi.fn() };
    const instruments = { search: vi.fn(async () => [{ id, symbol: '600000.SH', instrumentType: 'STOCK', displayName: '当前名称' }]) as never,
      resolveCanonicalSymbols: vi.fn(async (symbols: readonly string[]) => ({ items: symbols.includes('600000.SH')
        ? [{ instrumentId: id, symbol: '600000.SH', market: 'CN' as const, assetType: 'STOCK' as const, currency: 'CNY' as const, catalogGeneration: 1 }] : [], unresolvedSymbols: [] })) };
    const source = new MarketArenaHistorySource(dsa, instruments);
    const p = liveProtocolFixture({ market: 'CN', currency: 'CNY', timeZone: 'Asia/Shanghai', universe: 'market' });
    expect(await source.resolve(p, [], '2026-11-02T01:31:00.000Z')).toEqual([]);
    expect(instruments.resolveCanonicalSymbols).not.toHaveBeenCalled();
    expect(await source.search(p, '浦发', '2026-11-02T01:31:00.000Z')).toEqual([{ instrumentId: id, symbol: '600000.SH', assetType: 'STOCK', name: '600000.SH' }]);
    expect(dsa.arenaHistoryMinutes).not.toHaveBeenCalled();
    await source.research(p, '2026-11-02T01:31:00.000Z', { symbol: '600000.SH', timeframe: '1m', limit: 10 });
    expect(dsa.arenaHistoryMinutes).toHaveBeenCalledExactlyOnceWith({ market: 'CN', symbol: '600000.SH', assetType: 'STOCK', date: '2026-11-02', timeframe: '1m' });
    await expect(source.research(p, '2026-11-02T01:31:00.000Z', { symbol: '000001.SZ', timeframe: '1m', limit: 10 })).rejects.toThrow('symbol_outside_universe');
    expect(dsa.arenaHistoryMinutes).toHaveBeenCalledTimes(1);
    expect(dsa.arenaHistoryCatalog).not.toHaveBeenCalled();
  });
  it('按区间结束时点裁剪，下载时间保持真实；重复观察只获取一次', async () => {
    const dsa = { arenaHistoryMinutes: vi.fn(async () => raw), arenaHistoryCatalog: vi.fn() };
    const source = new MarketArenaHistorySource(dsa), p = liveProtocolFixture({ market: 'CN', currency: 'CNY', timeZone: 'Asia/Shanghai' });
    const result = await source.prices(p, '600000.SH', 'STOCK', '2026-11-02', '2026-11-02T01:31:00.000Z');
    expect(result.points).toHaveLength(1);
    expect(result.points[0]?.timestamp).toBe('2026-11-02T01:31:00.000Z');
    expect(result.evidence.observedAt).toBe(raw.value.observedAt);
    expect(result.evidence.archiveRef).toBe(raw.archiveRef);
    await source.prices(p, '600000.SH', 'STOCK', '2026-11-02', '2026-11-02T01:32:00.000Z');
    expect(dsa.arenaHistoryMinutes).toHaveBeenCalledTimes(1);
  });
  it('客户端拒绝错标的、无序分钟及错误请求关联', async () => {
    for (const patch of [{ value: { ...raw.value, symbol: '000001.SZ' } },
      { value: { ...raw.value, rows: [...raw.value.rows].reverse() } }, { requestId: 'wrong' }]) {
      await expect(readArenaHistoryMinutes(async (_path, body) => ({ ...raw, requestId: (body as { requestId: string }).requestId, ...patch }),
        { market: 'CN', date: '2026-11-02', symbol: '600000.SH', assetType: 'STOCK' })).rejects.toThrow();
    }
  });
  it('历史研究和指标只传模拟时点前的完整分钟，保持证券范围', async () => {
    const calculateIndicators = vi.fn(async (input: unknown): Promise<never> => { void input; throw new Error('controlled-stop'); });
    const dsa = { arenaHistoryMinutes: vi.fn(async () => raw), arenaHistoryCatalog: vi.fn(), calculateIndicators };
    const p = liveProtocolFixture({ market: 'CN', currency: 'CNY', timeZone: 'Asia/Shanghai', universe: 'fixed',
      instruments: [{ instrumentId: '11111111-1111-4111-8111-111111111111', symbol: '600000.SH', assetType: 'STOCK' }] });
    const source = new MarketArenaHistorySource(dsa), at = '2026-11-02T01:31:00.000Z';
    const request = { symbol: '600000.SH', timeframe: '1m', limit: 100 };
    const bars = await source.research(p, at, request);
    expect('points' in bars && bars.points).toHaveLength(1);
    await expect(source.research(p, at, { ...request, indicator: 'MA' })).rejects.toThrow('controlled-stop');
    expect(calculateIndicators.mock.calls[0]?.[0]).toMatchObject({ points: [expect.objectContaining({ timestamp: at, availableAt: at })] });
    await expect(source.research(p, at, { ...request, symbol: '000001.SZ' })).rejects.toThrow('symbol_outside_universe');
    await expect(source.research(p, at, { ...request, timeframe: '1d' })).rejects.toThrow('replay_tools_unavailable');
  });
});
