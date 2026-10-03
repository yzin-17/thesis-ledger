import { describe, expect, it, vi } from 'vitest';
import {
  catalogJobFeedback,
  catalogJobPollingInterval,
  parseCatalogJobResponse,
} from '../src/features/market-data/catalog-job-response.js';
import { fetchCatalogJob, startCatalogSync } from '../src/features/market-data/market-data.api.js';

const request = vi.hoisted(() => vi.fn());
vi.mock('../src/shared/api/client.js', () => ({ getDesktopApiClient: () => ({ request }) }));

const pending = {
  contractVersion: 3,
  consumer: 'thesis-ledger',
  id: 'current-job',
  status: 'pending',
  generation: 0,
  checksum: '',
  owner: null,
  leaseExpiresAt: null,
  leaseValid: false,
  retryable: true,
  createdAt: '2026-10-02T00:00:00Z',
  updatedAt: '2026-10-02T00:00:00Z',
  acknowledged: false,
};
const succeeded = {
  ...pending,
  status: 'succeeded',
  generation: 28,
  checksum: 'a'.repeat(64),
  cursor: 'generation:28',
  count: 5920,
  acknowledged: true,
};

describe('目录任务客户端当前合同', () => {
  it('触发和查询只请求当前路径，查询绑定任务 ID', async () => {
    request.mockResolvedValueOnce(pending).mockResolvedValueOnce(succeeded);
    expect((await startCatalogSync()).status).toBe('pending');
    expect((await fetchCatalogJob('current-job')).acknowledged).toBe(true);
    expect(request.mock.calls.slice(-2)).toEqual([
      ['/api/market-data/catalog/sync', { method: 'POST' }],
      ['/api/market-data/catalog/jobs/current-job'],
    ]);
    request.mockResolvedValueOnce({ ...pending, id: 'different-job' });
    await expect(fetchCatalogJob('current-job')).rejects.toThrow('当前合同');
  });

  it.each([
    { ...pending, contractVersion: 2 },
    { ...pending, contractVersion: undefined },
    { ...pending, consumer: 'other' },
    { ...pending, owner: undefined },
    { ...pending, leaseValid: undefined },
    { ...pending, createdAt: 'yesterday' },
    { ...pending, legacyStatus: 'done' },
    { ...pending, acknowledged: true },
    { ...succeeded, acknowledged: false },
    { ...succeeded, cursor: 'generation:27' },
    { ...succeeded, checksum: 'legacy-checksum' },
    { ...succeeded, generation: 0 },
    { ...succeeded, count: undefined },
    { ...succeeded, count: -1 },
  ])('拒绝旧合同、无效字段和错位成功身份 %#', (raw) => {
    expect(() => parseCatalogJobResponse(raw)).toThrow('当前合同');
  });

  it('只有已确认的成功显示成功，其他终态显示中文失败', () => {
    expect(catalogJobFeedback(parseCatalogJobResponse(pending), false)).toBeNull();
    expect(catalogJobFeedback(parseCatalogJobResponse(succeeded), false)?.type).toBe('success');
    for (const status of ['failed', 'timeout']) {
      const job = parseCatalogJobResponse({ ...pending, status });
      expect(catalogJobFeedback(job, false)?.type).toBe('error');
      expect(catalogJobPollingInterval(job, false)).toBe(false);
    }
  });

  it('查询失败停止轮询，缓存中的成功不得掩盖查询错误', () => {
    expect(catalogJobPollingInterval(undefined, true)).toBe(false);
    expect(catalogJobFeedback(parseCatalogJobResponse(succeeded), true)?.type).toBe('error');
    expect(catalogJobPollingInterval(parseCatalogJobResponse(pending), false)).toBe(1500);
    expect(catalogJobPollingInterval(parseCatalogJobResponse(succeeded), false)).toBe(false);
  });
});
