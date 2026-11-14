import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { readWithDataQuality } from '../../src/market/market-data-quality.js';
import { MarketDataIdentityError } from '../../src/market/market-current-data.js';
import { DsaError } from '../../src/integration/dsa/dsa.client.js';

const context = { capability: 'REALTIME_QUOTE', provider: 'dsa', symbol: '600000.SH' };
describe('行情数据质量观察边界', () => {
  it('记录格式、身份及合同错误并保留原异常对象', async () => {
    const invalid = z.number().safeParse('invalid');
    if (invalid.success) throw new Error('fixture');
    const errors = [
      invalid.error,
      new MarketDataIdentityError(),
      new DsaError('不可泄露原始正文', 'invalid-response'),
    ];
    const codes = [
      'response_schema_invalid',
      'response_identity_mismatch',
      'response_contract_invalid',
    ];
    for (const [index, error] of errors.entries()) {
      const observe = vi.fn(async () => null);
      await expect(
        readWithDataQuality({ observe } as never, context, () => {
          throw error;
        }),
      ).rejects.toBe(error);
      expect(observe).toHaveBeenCalledWith({ ...context, code: codes[index] });
    }
  });
  it('成功、网络、权限、控制变化和主动取消均不记质量问题', async () => {
    const observe = vi.fn();
    await expect(readWithDataQuality({ observe } as never, context, () => 42)).resolves.toBe(42);
    for (const error of [
      new DsaError('超时', 'timeout'),
      new DsaError('控制变化', 'stale-revision'),
      new DsaError('权限', 'permission-denied'),
      new DOMException('取消', 'AbortError'),
    ]) {
      await expect(
        readWithDataQuality({ observe } as never, context, () => {
          throw error;
        }),
      ).rejects.toBe(error);
    }
    expect(observe).not.toHaveBeenCalled();
  });
  it('记录器失败不能覆盖原错误', async () => {
    const error = new MarketDataIdentityError();
    await expect(
      readWithDataQuality(
        {
          observe: async () => {
            throw new Error('database');
          },
        } as never,
        context,
        () => {
          throw error;
        },
      ),
    ).rejects.toBe(error);
  });
});
