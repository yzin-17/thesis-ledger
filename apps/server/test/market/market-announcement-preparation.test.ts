import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { MarketAnnouncementPreparationService } from '../../src/market/market-announcement-preparation.service.js';

const window = { market: 'CN', instrumentType: 'STOCK', symbol: '000881.SZ', start: '2023-08-21',
  end: '2023-08-23', historyBasis: 'fixed-provider-snapshot' };
const pending = { status: 'preparing', total: 1, completed: 0, failed: 0, matched: 0,
  downloaded: 0, parsed: 0, jobIds: ['a'.repeat(64)], errors: [] };
const fixture = () => {
  const dsa = {
    effectiveControlPolicyV3: vi.fn(async () => ({ projection: { effective: { enabled: true,
      routes: [{ key: { market: 'CN', assetType: 'STOCK', capability: 'HISTORICAL_TRADING_STATUS' },
        targets: [{ providerId: 'official-states', upstreamSource: 'cn-stock-risk-price-limits', eligible: true }] }] } } })),
    control: vi.fn<(path: string, init: { body: string }) => Promise<typeof pending>>(async () => pending),
  };
  return { dsa, service: new MarketAnnouncementPreparationService(dsa as never) };
};

describe('市场公告自动准备', () => {
  it('仅已选择的本地股票公告路由触发获取，严格解析进度', async () => {
    const { dsa, service } = fixture();
    expect(await service.prepare(window)).toEqual(pending);
    expect(JSON.parse(dsa.control.mock.calls[0]![1]!.body)).toEqual({
      symbols: [window.symbol], start: window.start, end: window.end,
    });
    await service.prepare({ ...window, market: 'HK' });
    await service.prepare({ ...window, historyBasis: 'point-in-time' });
    expect(dsa.control).toHaveBeenCalledTimes(1);
  });
  it('来源未选用时不获取，服务失败仍保留可用库存语义', async () => {
    const { dsa, service } = fixture();
    dsa.effectiveControlPolicyV3.mockResolvedValue({ projection: { effective: { enabled: false, routes: [] } } });
    expect(await service.prepare(window)).toBeUndefined();
    expect(dsa.control).not.toHaveBeenCalled();
    dsa.effectiveControlPolicyV3.mockRejectedValue(new Error('503'));
    expect(await service.prepare(window)).toMatchObject({ status: 'ready', errors: [{ reason: '503' }] });
  });
});
