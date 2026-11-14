import { describe, expect, it, vi } from 'vitest';
import { MarketBackgroundBarReader } from '../../src/market/market-background-bar-reader.js';

const input = {
  market: 'HK',
  symbol: '00700.HK',
  routeKey: {
    kind: 'bar',
    market: 'HK',
    assetType: 'STOCK',
    capability: 'DAILY_BAR',
    timeframe: '1d',
    adjustment: 'none',
  },
  window: { start: '2026-11-01', end: '2026-11-12' },
} as const;
const selected = { status: 'selected', selection: { response: { bars: [] } } };
function harness() {
  const policy = { enabled: true, revision: 1, syncState: 'applied' };
  const values = new Map<string, string>();
  const client = {
    get: vi.fn(async (key: string) => values.get(key) ?? null),
    set: vi.fn(async (key: string, value: string, ...args: unknown[]) => {
      if (args.includes('NX') && values.has(key)) return null;
      values.set(key, value);
      return 'OK';
    }),
  };
  const bars = { readV3: vi.fn(async () => selected) };
  return {
    values,
    client,
    bars,
    policy,
    create: () =>
      new MarketBackgroundBarReader(
        bars as never,
        { client } as never,
        { desiredProviderPolicy: { findUnique: async () => policy } } as never,
      ),
  };
}
describe('后台日线窗口读取', () => {
  it('控制关闭不复用缓存；修订使缓存失效但不重置请求窗口', async () => {
    const h = harness();
    await h.create().read(input);
    h.policy.enabled = false;
    await expect(h.create().read(input)).rejects.toMatchObject({
      reasonCode: 'market_control_disabled',
    });
    h.policy.enabled = true;
    h.policy.revision = 2;
    await expect(h.create().read(input)).rejects.toMatchObject({
      reasonCode: 'market_data_pending',
    });
    expect(h.bars.readV3).toHaveBeenCalledOnce();
  });
  it('成功窗口跨实例复用，不重复调用 Reader', async () => {
    const h = harness();
    await h.create().read(input);
    await h.create().read(input);
    expect(h.bars.readV3).toHaveBeenCalledOnce();
    expect(h.client.set).toHaveBeenCalledWith(
      expect.stringContaining(':attempt'),
      '1',
      'EX',
      600,
      'NX',
    );
  });
  it('失败同样保留请求窗口，窗口到期后能恢复', async () => {
    const h = harness();
    h.bars.readV3.mockRejectedValueOnce(new Error('受控来源失败'));
    await expect(h.create().read(input)).rejects.toMatchObject({
      reasonCode: 'daily_bars_unavailable',
    });
    await expect(h.create().read(input)).rejects.toThrow('日线来源请求失败');
    expect(h.bars.readV3).toHaveBeenCalledOnce();
    h.values.clear();
    expect(await h.create().read(input)).toEqual(selected);
    expect(h.bars.readV3).toHaveBeenCalledTimes(2);
  });
  it('另一个进程正在读取时说明等待，不并发请求', async () => {
    const h = harness();
    let finish!: (value: typeof selected) => void;
    h.bars.readV3.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const first = h.create().read(input);
    await vi.waitFor(() => expect(h.bars.readV3).toHaveBeenCalledOnce());
    await expect(h.create().read(input)).rejects.toMatchObject({
      reasonCode: 'market_data_pending',
    });
    finish(selected);
    await first;
    expect(h.bars.readV3).toHaveBeenCalledOnce();
  });
});
