import { describe, expect, it } from 'vitest';
import { marketDataErrorEnvelopeV3Schema } from '@thesis-ledger/schemas';
import { mapDataV3HttpError } from '../../src/integration/dsa/dsa-v3-protocol.js';

const envelope = (code: string, message: string) => ({
  detail: {
    contractVersion: 3,
    requestId: 'capability-request',
    error: { code, message },
  },
});

describe('独立能力沿Data V3标准安全错误', () => {
  it('真实能力不支持单独分类，不伪称口径或契约版本错误', () => {
    const raw = envelope('unsupported_capability', '来源不支持请求的数据能力');
    expect(marketDataErrorEnvelopeV3Schema.safeParse(raw.detail).success).toBe(true);
    expect(mapDataV3HttpError(422, raw, 'capability-request')).toMatchObject({
      code: 'unsupported-capability',
      status: 422,
    });
  });
  it.each([
    ['upstream_failure', '行情上游暂时不可用', 'unavailable'],
    ['insufficient_coverage', '请求区间的数据覆盖不足', 'insufficient-coverage'],
    ['source_symbol_unrecognized', '来源未识别请求的证券', 'source-symbol-unrecognized'],
    ['permission_denied', '来源权限不足', 'permission-denied'],
    ['authentication_failed', '来源凭据未通过认证', 'source-authentication-failed'],
    ['invalid_request', '来源拒绝请求参数', 'invalid-request'],
  ])('保持来源错误分类 %s', (code, message, expected) => {
    expect(mapDataV3HttpError(503, envelope(code!, message!), 'capability-request').code).toBe(
      expected,
    );
  });
  it('旧平铺V3、错关联、原始供应商错误仍严格拒绝', () => {
    const valid = envelope('upstream_failure', '行情上游暂时不可用');
    const bad = [
      {
        detail: {
          contractVersion: 3,
          requestId: 'capability-request',
          code: 'upstream_failure',
          message: '行情上游暂时不可用',
        },
      },
      envelope('upstream_failure', 'raw vendor secret'),
    ];
    for (const raw of bad) {
      expect(mapDataV3HttpError(503, raw, 'capability-request').code).toBe('invalid-response');
    }
    expect(mapDataV3HttpError(503, valid, 'different-request').code).toBe('invalid-response');
  });
});
