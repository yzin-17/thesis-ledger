import { describe, expect, it, vi } from 'vitest';
import type { DsaClient } from '../../src/integration/dsa/dsa.client.js';
import { readDsaEventAdmissionCatalogV3 } from '../../src/integration/dsa/dsa-event-admission-catalog-v3.js';

function client(raw: unknown) {
  const control = vi.fn().mockResolvedValue(raw);
  return { control, port: { control } as unknown as Pick<DsaClient, 'control'> };
}

describe('事件准入只读视图客户端', () => {
  it('通过原Control GET和显式版本参数读取，单次预算', async () => {
    const value = { protocolVersion: 'event-admission-catalog-v1', admissions: [], catalog: {
      contractVersion: 3, consumer: 'thesis-ledger', catalogRevision: 1,
      generatedAt: '2026-10-12T10:00:00Z', integrity: 'complete', entries: [],
    } };
    const input = client(value);
    expect(await readDsaEventAdmissionCatalogV3(input.port)).toEqual(value);
    expect(input.control).toHaveBeenCalledOnce();
    expect(input.control.mock.calls[0]?.slice(0, 3)).toEqual([
      '/api/v3/thesis-ledger/control/routes/capabilities?contractVersion=3&eventAdmissions=v1', undefined, 1,
    ]);
  });

  it('旧视图/敏感坏输入不作为精确证明，不重试且错误脱敏', async () => {
    const input = client({ token: 'private-token-fixture', contractVersion: 3 });
    await expect(readDsaEventAdmissionCatalogV3(input.port)).rejects.toMatchObject({ code: 'invalid-response' });
    await expect(readDsaEventAdmissionCatalogV3(input.port)).rejects.not.toThrow('private-token-fixture');
    expect(input.control).toHaveBeenCalledTimes(2);
  });

  it('控制拒绝保持原码，不转为数据供应商失败或重试', async () => {
    const input = client(undefined);
    const rejection = Object.assign(new Error('固定控制拒绝'), { code: 'unauthorized', status: 401 });
    input.control.mockRejectedValue(rejection);
    await expect(readDsaEventAdmissionCatalogV3(input.port)).rejects.toBe(rejection);
    expect(input.control).toHaveBeenCalledOnce();
  });
});
