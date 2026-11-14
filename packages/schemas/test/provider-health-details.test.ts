import { describe, expect, it } from 'vitest';
import {
  providerHealthPageSchema,
  providerHealthDetailsSchema,
} from '../src/provider-diagnostics.js';

const usage = { status: 'unknown', inputTokens: null, outputTokens: null };
const validation = {
  kind: 'ai_provider_validation',
  operationId: '93d88c31-91e9-4014-a727-c6fd03734f78',
  requestId: 'ba72dbf0-958d-4c88-8cb6-03b7a6f9592f',
  fingerprint: 'route-fingerprint',
  model: 'controlled-model',
  purpose: 'research',
  mode: 'native_schema',
  status: 'pending',
  usage,
};

describe('健康历史当前事件契约', () => {
  it('过程、终态、操作和普通检查能够混合分页，保留验证事实', () => {
    const details = [
      null,
      validation,
      { ...validation, status: 'passed' },
      { ...validation, status: 'failed' },
      { kind: 'ai_provider_validation_operation', planFingerprint: 'plan', status: 'running' },
    ];
    const page = providerHealthPageSchema.parse({
      items: details.map((item) => ({
        provider: 'controlled',
        state: 'degraded',
        latencyMs: 0,
        checkedAt: '2026-11-12T10:00:00Z',
        details: item,
      })),
      page: 1,
      pageSize: 20,
      total: details.length,
      totalPages: 1,
    });
    expect(page.items[1]?.details).toEqual(validation);
    expect(page.items[0]).not.toHaveProperty('details');
  });

  it('拒绝旧事件、未知状态和缺少验证身份的伪成功', () => {
    for (const details of [
      { ...validation, kind: 'ai_provider_test' },
      { ...validation, status: 'healthy' },
      { ...validation, requestId: undefined },
      { kind: 'ai_provider_validation_operation', planFingerprint: 'plan', status: 'passed' },
    ])
      expect(providerHealthDetailsSchema.safeParse(details).success).toBe(false);
  });
});
