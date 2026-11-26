import { describe, expect, it, vi } from 'vitest';
import { MarketArenaReplayReader, visibleReplayPoint } from '../../src/market/market-arena-replay-reader.js';
import { LiveResearchTools } from '../../src/model-arena/live/live-research-tools.js';
import { liveProtocolFixture } from '../model-arena/live-fixture.js';
import { LiveExecutionContext } from '../../src/model-arena/live/live-execution-context.js';
import { arenaLiveAccountSchema, type ArenaLiveDecision } from '@thesis-ledger/schemas';

const at = '2026-11-02T14:31:00.000Z';
const point = { timestamp: at, availableAt: at, open: 10, high: 10, low: 10, close: 10, volume: 1, amount: 10, completionStatus: 'complete' as const };
describe('历史观察来源准入', () => {
  it('显式保护期限扩展历史日历请求，未读取的日期拒绝解析', async () => {
    const calendars = { read: vi.fn(async () => ({ status: 'ready' as const, calendar: { market: 'US' as const, timezone: 'America/New_York', revision: 'controlled',
      availableAt: '2026-01-01T00:00:00.000Z', coverageStart: '2026-10-01', coverageEnd: '2026-12-01',
      sessions: [{ tradingDate: '2026-11-02', startAt: '2026-11-02T14:30:00.000Z', endAt: '2026-11-02T21:00:00.000Z' },
        { tradingDate: '2026-12-01', startAt: '2026-12-01T14:30:00.000Z', endAt: '2026-12-01T21:00:00.000Z' }] } })) };
    const reader = new MarketArenaReplayReader(calendars, { readRetainedResearch: vi.fn() }, { backtestInstrumentFacts: vi.fn() }, { readComposition: vi.fn() }, { read: vi.fn() });
    const read = await reader.observe(liveProtocolFixture(), at, [], [], [], ['2026-12-01']);
    expect(calendars.read).toHaveBeenCalledWith(expect.objectContaining({ end: '2026-12-01', evaluationAsOf: at }));
    expect(read.context.expiresAt('2026-12-01', 'stop_loss')).toBe('2026-12-01T21:00:00.000Z');
    expect(() => read.context.expiresAt('2026-12-02', 'stop_loss')).toThrow('expiry_calendar_unavailable');
  });
  it('研究价格与可成交证据分别表达，观察不依赖成交规则；真实委托仍拒绝', async () => {
    const calendars = { read: vi.fn(async () => ({ status: 'ready' as const, calendar: { market: 'US' as const, timezone: 'America/New_York', revision: 'controlled',
      availableAt: '2026-01-01T00:00:00.000Z', coverageStart: '2026-10-01', coverageEnd: '2026-12-01',
      sessions: [{ tradingDate: '2026-11-02', startAt: '2026-11-02T14:30:00.000Z', endAt: '2026-11-02T21:00:00.000Z' }] } })) };
    const bars = { readRetainedResearch: vi.fn(async () => ({ status: 'selected', selection: { response: { bars: [point] } }, evidence: {}, seriesVersion: 'controlled' })) as never };
    const dsa = { backtestInstrumentFacts: vi.fn(async () => ({ facts: [] })) as never };
    const reader = new MarketArenaReplayReader(calendars, bars, dsa, { readComposition: vi.fn() }, { read: vi.fn() });
    const p = liveProtocolFixture({ universe: 'fixed', instruments: [{ instrumentId: '11111111-1111-4111-8111-111111111111', symbol: 'AAPL.US', assetType: 'STOCK' }] });
    const read = await reader.observe(p, at, ['AAPL.US'], [], []);
    expect(read.prices.get('AAPL.US')).toBe('10');
    expect(read.observations).toEqual([{ symbol: 'AAPL.US', price: '10', marketTime: at, observedAt: at }]);
    expect(read.context.quotes).toEqual([]);
    expect(dsa.backtestInstrumentFacts).not.toHaveBeenCalled();
    expect(await reader.quote(p, at, 'AAPL.US')).toMatchObject({ price: '10', asOf: at, execution: { status: 'unavailable', reason: 'replay_rules_unavailable' } });
    const execution = new LiveExecutionContext({} as never, { getSession: vi.fn() }, { read: vi.fn() }, reader);
    const account = arenaLiveAccountSchema.parse({ revision: 0, cash: '10000', positions: [], cashSettlements: [], orders: [], wakeups: [], watchedSymbols: [], fills: [] });
    const decision: ArenaLiveDecision = { summary: '观察价格', orders: [], cancelOrderIds: [], watchedSymbols: ['AAPL.US'], wakeups: [{ kind: 'price', symbol: 'AAPL.US', operator: 'gte', price: '11' }] };
    await expect(execution.build(p, [account], decision, [], at)).resolves.toMatchObject({ context: { allowedSymbols: new Set(['AAPL.US']), quotes: [] } });
    await expect(execution.build(p, [account], { ...decision, orders: [{ clientId: 'buy', symbol: 'AAPL.US', side: 'buy', kind: 'market', quantity: '1', price: null, expiresOn: null, exitGroup: null }] }, [], at)).rejects.toThrow('replay_rules_unavailable');
  });
  it('拒绝未来发布、未来价格和未结束的分钟；休市只接受截至模拟时点的完整观察', () => {
    expect(visibleReplayPoint([point], at)).toEqual(point);
    expect(visibleReplayPoint([{ ...point, availableAt: '2026-11-02T14:32:00.000Z' }], at)).toBeNull();
    expect(visibleReplayPoint([{ ...point, completionStatus: 'incomplete' }], at)).toBeNull();
    expect(visibleReplayPoint([{ ...point, timestamp: '2026-11-02T14:32:00.000Z' }], at)).toBeNull();
    expect(visibleReplayPoint([point], '2026-11-02T15:00:00.000Z', false)).toEqual(point);
  });
  it('已发布分钟证据缺失时固定原因；不调用当前图表、报价或执行规则', async () => {
    const calendars = { read: vi.fn(async () => ({ status: 'ready' as const, calendar: { market: 'US' as const, timezone: 'America/New_York', revision: 'controlled',
      availableAt: '2026-01-01T00:00:00.000Z', coverageStart: '2026-10-01', coverageEnd: '2026-12-01',
      sessions: [{ tradingDate: '2026-11-02', startAt: '2026-11-02T14:30:00.000Z', endAt: '2026-11-02T21:00:00.000Z' }] } })) };
    const bars = { readRetainedResearch: vi.fn(async () => null) }, dsa = { backtestInstrumentFacts: vi.fn() }, status = { readComposition: vi.fn() }, actions = { read: vi.fn() };
    const reader = new MarketArenaReplayReader(calendars, bars, dsa, status, actions);
    const p = liveProtocolFixture({ universe: 'fixed', instruments: [{ instrumentId: '11111111-1111-4111-8111-111111111111', symbol: 'AAPL.US', assetType: 'STOCK' }] });
    await expect(reader.observe(p, at, ['AAPL.US'])).rejects.toThrow('replay_prices_unavailable');
    expect(bars.readRetainedResearch).toHaveBeenCalledWith(expect.objectContaining({ routeKey: expect.objectContaining({ capability: 'MINUTE_BAR', adjustment: 'none' }) }));
    expect(dsa.backtestInstrumentFacts).not.toHaveBeenCalled();
    await expect(reader.observe({ ...p, universe: 'market' }, at, [])).resolves.toMatchObject({ prices: new Map(), context: { quotes: [] } });
    await expect(reader.next({ ...p, universe: 'market' }, '2026-11-02T05:00:00.000Z', at)).resolves.toBe(at);
    expect(bars.readRetainedResearch).toHaveBeenCalledTimes(1);
  });
  it('历史研究拒绝当前新闻、网页、目录和图表，时间参数不丢失', async () => {
    const instruments = { search: vi.fn(), resolveCanonicalSymbols: vi.fn() }, market = { getQuote: vi.fn() };
    const series = { read: vi.fn() }, news = { read: vi.fn() }, search = { read: vi.fn() };
    const tools = new LiveResearchTools(instruments, market, series, news, search);
    const p = liveProtocolFixture({ allowWebSearch: true }), signal = new AbortController().signal;
    for (const request of [{ name: 'web_search', query: 'historical' }, { name: 'search_instruments', query: 'AAPL' },
      { name: 'news', symbol: 'AAPL.US' }, { name: 'bars', symbol: 'AAPL.US', timeframe: '1d', limit: 10 }, { name: 'quote', symbol: 'AAPL.US' }])
      await expect(tools.execute(p, request, signal, at)).rejects.toThrow('replay_tools_unavailable');
    expect(instruments.search).not.toHaveBeenCalled(); expect(instruments.resolveCanonicalSymbols).not.toHaveBeenCalled();
    expect(market.getQuote).not.toHaveBeenCalled(); expect(news.read).not.toHaveBeenCalled(); expect(search.read).not.toHaveBeenCalled(); expect(series.read).not.toHaveBeenCalled();
  });
});
