import { describe, expect, it } from 'vitest';
import {
  parseCatalogJob,
  parseCatalogAck,
  parseCatalogSnapshot,
  parseCatalogDelta,
} from '../../src/integration/dsa/dsa-catalog-v3.js';
import { assertCatalogSyncInput } from '../../src/market/market-catalog-input.js';

const checksum = 'a'.repeat(64);
const envelope = { contractVersion: 3, consumer: 'thesis-ledger' };
const job = {
  ...envelope,
  id: 'job-1',
  requestId: 'request-1',
  status: 'succeeded',
  generation: 1,
  checksum,
  owner: 'isolated-worker',
  leaseExpiresAt: '2026-10-02T00:05:00Z',
  leaseValid: false,
  retryable: false,
  createdAt: '2026-10-02T00:00:00Z',
  updatedAt: '2026-10-02T00:00:01Z',
};
const snapshot = {
  contractVersion: 3,
  generation: 1,
  checksum,
  cursor: 'generation:1',
  complete: true,
  items: [],
};
const ack = {
  ...envelope,
  requestId: 'request-1',
  acknowledged: true,
  generation: 1,
  checksum,
  cursor: 'generation:1',
};

describe('Catalog 当前传输身份', () => {
  it('同源生产响应可解析，触发与轮询分别绑定请求和 Job', () => {
    expect(parseCatalogJob(job, { requestId: 'request-1' }).id).toBe('job-1');
    expect(parseCatalogJob(job, { id: 'job-1' }).status).toBe('succeeded');
    expect(parseCatalogSnapshot(snapshot)).toEqual(snapshot);
    expect(
      parseCatalogDelta({ ...snapshot, fromCursor: 'generation:1', deleted: [] }, 'generation:1')
        .items,
    ).toEqual([]);
    expect(parseCatalogAck(ack, 1, checksum, 'request-1')).toEqual(ack);
  });
  it.each([1, 2, undefined])('旧信封 %s 不解析为当前 Job 或目录', (contractVersion) => {
    expect(() => parseCatalogJob({ ...job, contractVersion }, {})).toThrow();
    expect(() => parseCatalogSnapshot({ ...snapshot, contractVersion })).toThrow();
    expect(() => parseCatalogAck({ ...ack, contractVersion }, 1, checksum, 'request-1')).toThrow();
  });
  it('错配 Job/requestId、空成功身份及未知字段均拒绝', () => {
    expect(() => parseCatalogJob(job, { id: 'other' })).toThrow();
    expect(() => parseCatalogJob(job, { requestId: 'other' })).toThrow();
    expect(() => parseCatalogJob({ ...job, generation: 0, checksum: '' }, {})).toThrow();
    expect(() => parseCatalogJob({ ...job, legacy: true }, {})).toThrow();
  });
  it.each(['0', 'generation:0', 'generation:2', 'v2:1'])('旧或错配游标 %s 拒绝', (cursor) => {
    expect(() => parseCatalogSnapshot({ ...snapshot, cursor })).toThrow();
    expect(() => parseCatalogAck({ ...ack, cursor }, 1, checksum, 'request-1')).toThrow();
  });
  it('ACK 与 Delta 绑定整份目录身份', () => {
    for (const change of [
      { acknowledged: false },
      { checksum: 'b'.repeat(64) },
      { requestId: 'other' },
      { generation: 2 },
    ])
      expect(() => parseCatalogAck({ ...ack, ...change }, 1, checksum, 'request-1')).toThrow();
    expect(() =>
      parseCatalogDelta({ ...snapshot, fromCursor: 'generation:1', deleted: [] }, 'generation:2'),
    ).toThrow();
  });
  it('重复目录及增删交叠拒绝', () => {
    const item = {
      canonicalCode: '600519',
      instrumentType: 'STOCK',
      market: 'SH',
      displayName: '贵州茅台',
    };
    expect(() => parseCatalogSnapshot({ ...snapshot, items: [item, item] })).toThrow();
    expect(() =>
      parseCatalogDelta(
        {
          ...snapshot,
          items: [item],
          fromCursor: 'generation:1',
          deleted: [
            {
              canonicalCode: item.canonicalCode,
              instrumentType: item.instrumentType,
              market: item.market,
            },
          ],
        },
        'generation:1',
      ),
    ).toThrow();
  });
  it('公开同步入口在业务前拒绝旧信封', () => {
    expect(() => assertCatalogSyncInput()).not.toThrow();
    for (const raw of [
      { contractVersion: 1 },
      { contractVersion: 2 },
      { cursor: '0' },
      { consumer: 'other' },
    ])
      expect(() => assertCatalogSyncInput(raw)).toThrow();
  });
});
