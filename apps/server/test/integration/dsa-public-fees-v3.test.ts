import { describe, expect, it, vi } from 'vitest';
import { DsaDataCapabilityReaderV3 } from '../../src/integration/dsa/dsa-data-capability-reader-v3.js';
import { publicFeeInputs } from '../backtest/public-fees-fixtures.js';

describe('DSA 公共收费请求绑定', () => {
  it('使用正式 Data V3 入口，保留精确目标与整窗请求', async () => {
    const { fees, request } = await publicFeeInputs();
    const post = vi.fn(async (...args: unknown[]) => {
      expect(args).toHaveLength(3);
      return fees;
    });
    const reader = new DsaDataCapabilityReaderV3(post, (parse) => parse());
    expect(await reader.publicFees(request)).toEqual(fees);
    expect(post.mock.calls[0]![0]).toBe('/api/v3/thesis-ledger/market/public-fees');
    expect(post.mock.calls[0]![1]).toEqual(request);
  });
  it.each(['symbol', 'requestId', 'providerId'] as const)('拒绝 %s 错绑的响应', async (field) => {
    const { fees, request } = await publicFeeInputs();
    const bad = structuredClone(fees);
    if (field === 'providerId') bad.provenance.providerId = 'other';
    else bad[field] = 'other';
    const reader = new DsaDataCapabilityReaderV3(
      async () => bad,
      (parse) => parse(),
    );
    await expect(reader.publicFees(request)).rejects.toMatchObject({ code: 'invalid-response' });
  });
});
