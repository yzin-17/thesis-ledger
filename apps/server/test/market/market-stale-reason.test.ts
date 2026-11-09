import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { marketStaleReason } from '../../src/market/market-stale-reason.js';
import { DsaError } from '../../src/integration/dsa/dsa.client.js';

describe('行情缓存回退根因', () => {
  it.each([
    [new DsaError('secret', 'unauthorized', 401), 'unauthorized'],
    [new DsaError('secret', 'permission-denied', 403), 'permission_denied'],
    [new DsaError('secret', 'unavailable', 503), 'source_unavailable'],
    [new DsaError('secret', 'control-rejected'), 'control_rejected'],
    [z.number().safeParse('invalid').error, 'invalid_response'],
    [new Error('timeout unauthorized secret'), 'unknown'],
  ])('按结构化信息判断原因，不解析异常文本', (error, code) => {
    const result = marketStaleReason(error);
    expect(result.code).toBe(code);
    expect(result.message).not.toContain('secret');
    if (code === 'unknown') expect(result.message).toContain('未取得可识别的错误诊断');
  });
});
