import { describe, expect, it, vi } from 'vitest';
import { apiErrorResponseSchema } from '@thesis-ledger/schemas';
import { requireCurrentLedgerEnvelope } from '../../src/ledger/ledger-stored-envelope-version.js';
import { ApiExceptionFilter } from '../../src/platform/api-exception.filter.js';

describe('旧账本 HTTP 拒绝合同', () => {
  it('异常过滤器保留客户端可解析的错误码', () => {
    const json = vi.fn();
    const response = { status: vi.fn(() => ({ json })) };
    let failure: unknown;
    try {
      requireCurrentLedgerEnvelope(null);
    } catch (error) {
      failure = error;
    }
    new ApiExceptionFilter().catch(failure, {
      switchToHttp: () => ({ getResponse: () => response }),
    } as never);
    expect(response.status).toHaveBeenCalledWith(409);
    expect(apiErrorResponseSchema.parse(json.mock.calls[0]?.[0])).toMatchObject({
      error: 'UNSUPPORTED_CONTRACT_VERSION',
      code: 'UNSUPPORTED_CONTRACT_VERSION',
      message: '旧账本事件不支持读取或修订',
    });
  });
});
