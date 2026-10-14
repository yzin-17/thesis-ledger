import { describe, expect, it, vi } from 'vitest';
import { MarketAnnouncementsController } from '../src/market/market-announcements.controller.js';
import type { DsaClient } from '../src/integration/dsa/dsa.client.js';

describe('公告目录消费', () => {
  it('验证生产合同，保留未解析与失败记录', async () => {
    const response = { providerId: 'official-states', items: [], total: 0, page: 1, pageSize: 50 };
    const get = vi.fn().mockResolvedValue(response);
    const controller = new MarketAnnouncementsController({ get } as unknown as DsaClient);
    expect(await controller.list('000881')).toEqual(response);
    expect(get).toHaveBeenCalledWith(
      '/api/v3/thesis-ledger/market/announcements?q=000881&page=1&pageSize=50',
    );
    await expect(controller.list('', '0')).rejects.toThrow('公告查询参数无效');
    get.mockResolvedValue({ ...response, providerId: 'other' });
    await expect(controller.list()).rejects.toThrow('公告目录响应无效');
  });
});
