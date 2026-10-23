import { describe, expect, it, vi } from 'vitest';
import { ThesisLedgerApiClient, ThesisLedgerContractError } from '../src/index.js';

const window = { start: '2026-05-01', end: '2026-05-20' };
const response = () => ({
  contractVersion: 3,
  symbol: '159516.SZ',
  mode: 'v3',
  window,
  options: ['none', 'qfq', 'hfq'].map((adjustment) => ({
    adjustment,
    available: false,
    reason: 'not_admitted',
  })),
});
describe('图表可用性窗口传输', () => {
  it('规划参数和固定结束日期传输且校验回显', async () => {
    const plan = { barsLimit: 180, indicatorParams: { slow: 26 }, end: '2026-05-20' };
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ ...response(), plan }), { status: 200 }));
    const client = new ThesisLedgerApiClient('https://thesis-ledger.test/api/v1', fetcher);
    await client.market.getPlannedChartOptions('159516.SZ', plan);
    expect(String(fetcher.mock.calls[0]?.[0])).toContain('barsLimit=180');
    expect(String(fetcher.mock.calls[0]?.[0])).toContain('planEnd=2026-05-20');
    fetcher.mockResolvedValue(
      new Response(JSON.stringify({ ...response(), plan: { ...plan, barsLimit: 90 } }), {
        status: 200,
      }),
    );
    await expect(client.market.getPlannedChartOptions('159516.SZ', plan)).rejects.toBeInstanceOf(
      ThesisLedgerContractError,
    );
  });
  it('传递精确窗口与取消信号', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(response()), { status: 200 }));
    const client = new ThesisLedgerApiClient('https://thesis-ledger.test/api/v1', fetcher);
    const signal = new AbortController().signal;
    await client.market.getChartOptions('159516.SZ', signal, window);
    expect(fetcher).toHaveBeenCalledWith(expect.any(URL), expect.objectContaining({ signal }));
    expect(String(fetcher.mock.calls[0]?.[0])).toContain('start=2026-05-01&end=2026-05-20');
  });
  it.each(['symbol', 'window', 'missing'] as const)(
    '拒绝 %s 与本次请求不一致的响应',
    async (kind) => {
      const data: Record<string, unknown> = response();
      if (kind === 'symbol') data.symbol = 'OTHER';
      if (kind === 'window') data.window = { ...window, start: '2026-05-02' };
      if (kind === 'missing') delete data.window;
      const fetcher = vi
        .fn()
        .mockResolvedValue(new Response(JSON.stringify(data), { status: 200 }));
      const client = new ThesisLedgerApiClient('https://thesis-ledger.test/api/v1', fetcher);
      await expect(
        client.market.getChartOptions('159516.SZ', undefined, window),
      ).rejects.toBeInstanceOf(ThesisLedgerContractError);
    },
  );
  it('旧无窗口调用不接受窗口特定的可用性', async () => {
    const client = new ThesisLedgerApiClient(
      'https://thesis-ledger.test/api/v1',
      vi.fn().mockResolvedValue(new Response(JSON.stringify(response()), { status: 200 })),
    );
    await expect(client.market.getChartOptions('159516.SZ')).rejects.toBeInstanceOf(
      ThesisLedgerContractError,
    );
  });
  it('分钟能力与日线分开传递并拒绝周期串用', async () => {
    const data = { ...response(), symbol: 'SPY.US', timeframe: '1m' };
    delete (data as { window?: unknown }).window;
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(data), { status: 200 }));
    const client = new ThesisLedgerApiClient('https://thesis-ledger.test/api/v1', fetcher);
    await client.market.getChartOptions('SPY.US', undefined, undefined, '1m');
    expect(String(fetcher.mock.calls[0]?.[0])).toContain('timeframe=1m');
    fetcher.mockResolvedValue(new Response(JSON.stringify({ ...data, timeframe: '1d' }), { status: 200 }));
    await expect(client.market.getChartOptions('SPY.US', undefined, undefined, '1m'))
      .rejects.toBeInstanceOf(ThesisLedgerContractError);
  });
  it('分钟规划校验周期及全部原参数回显', async () => {
    const plan = { barsLimit: 90, indicatorParams: {}, timeframe: '1m' as const };
    const data = { ...response(), symbol: 'SPY.US', timeframe: '1m', plan };
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(data), { status: 200 }));
    const client = new ThesisLedgerApiClient('https://thesis-ledger.test/api/v1', fetcher);
    await client.market.getPlannedChartOptions('SPY.US', plan);
    expect(String(fetcher.mock.calls[0]?.[0])).toContain('timeframe=1m');
    fetcher.mockResolvedValue(new Response(JSON.stringify({ ...data, plan: { ...plan, timeframe: '1d' } }), { status: 200 }));
    await expect(client.market.getPlannedChartOptions('SPY.US', plan)).rejects.toBeInstanceOf(ThesisLedgerContractError);
  });

  it('显式港美类型进入规划请求且不能接受不同类型或缺少回显', async () => {
    const plan = { barsLimit: 180, indicatorParams: {}, timeframe: '1m' as const, assetType: 'ETF' as const };
    const data = { ...response(), symbol: 'SPY.US', timeframe: '1m', plan };
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(data), { status: 200 }));
    const client = new ThesisLedgerApiClient('https://thesis-ledger.test/api/v1', fetcher);
    await client.market.getPlannedChartOptions('SPY.US', plan);
    expect(String(fetcher.mock.calls[0]?.[0])).toContain('assetType=ETF');
    for (const assetType of ['STOCK', undefined]) {
      fetcher.mockResolvedValue(new Response(JSON.stringify({ ...data, plan: { ...plan, assetType } }), { status: 200 }));
      await expect(client.market.getPlannedChartOptions('SPY.US', plan)).rejects.toBeInstanceOf(ThesisLedgerContractError);
    }
  });
});
