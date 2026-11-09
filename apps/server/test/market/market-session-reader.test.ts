import { afterEach, expect, it, vi } from 'vitest';
import { MarketSessionReader } from '../../src/market/market-session-reader.js';
const calendar = { market: 'CN' as const, timezone: 'Asia/Shanghai', revision: 'verified', availableAt: '2026-01-01T00:00:00Z', coverageStart: '2026-11-01', coverageEnd: '2026-11-15', sessions: [
  { tradingDate: '2026-11-09', startAt: '2026-11-09T01:30:00Z', endAt: '2026-11-09T03:30:00Z' },
  { tradingDate: '2026-11-09', startAt: '2026-11-09T05:00:00Z', endAt: '2026-11-09T07:00:00Z' },
] };
afterEach(() => vi.useRealTimers());
it('同市场同日合并日历请求，每次状态按实时边界重新计算', async () => {
  const read = vi.fn().mockResolvedValue({ status: 'ready', calendar });
  const reader = new MarketSessionReader({ read });
  const [open, lunch] = await Promise.all([reader.read('CN', new Date('2026-11-09T03:29:59Z')), reader.read('CN', new Date('2026-11-09T03:30:00Z'))]);
  expect(open.state).toBe('open'); expect(lunch.state).toBe('closed'); expect(lunch.tradingDayState).toBe('open'); expect(read).toHaveBeenCalledTimes(1);
});
it('读取失败与不完整保留明确未知原因，不回退内置日历', async () => {
  const at = new Date('2027-01-04T02:00:00Z');
  const reader = new MarketSessionReader({ read: vi.fn().mockResolvedValue({ status: 'unavailable', reason: 'calendar_incomplete' }) });
  expect(await reader.read('CN', at)).toMatchObject({ state: 'unknown', reason: 'calendar_incomplete' });
  expect(await new MarketSessionReader({ read: vi.fn().mockRejectedValue(new Error('offline')) }).read('CN', at)).toMatchObject({ state: 'unknown', reason: 'calendar_unavailable' });
});
