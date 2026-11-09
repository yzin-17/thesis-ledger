import { describe, expect, it } from 'vitest';
import { riskScanEnvelopeSchema, riskScanResponseSchema } from '../src/index.js';

const marketTime = '2026-11-07T12:30:00Z';

describe('风险输入的真实权重', () => {
  it.each([-0.5, 0, 1, 1.872, 1e-9])('证券与组合保留权重 %s', (weight) => {
    const parsed = riskScanEnvelopeSchema.parse({
      security: [{ symbol: 'TEST.US', weight, accountWeight: weight, marketTime }],
      portfolio: { positions: [{ symbol: 'TEST.US', weight }], marketTime },
    });
    expect(parsed.security[0]?.weight).toBe(weight);
    expect(parsed.security[0]?.accountWeight).toBe(weight);
    expect(parsed.portfolio?.positions?.[0]?.weight).toBe(weight);
  });

  it.each([NaN, Infinity, -Infinity, null, '187%'])('非法数字 %s 返回中文字段说明', (weight) => {
    const parsed = riskScanEnvelopeSchema.safeParse({
      security: [{ symbol: 'TEST.US', weight, marketTime }],
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]).toMatchObject({
        path: ['security', 0, 'weight'],
        message: '持仓权重必须是有效的有限数字',
      });
    }
  });

  it('扫描规则数可选，兼容旧响应', () => {
    const response = {
      traceId: '11111111-1111-4111-8111-111111111111',
      scanId: '22222222-2222-4222-8222-222222222222',
      results: [],
    };
    expect(riskScanResponseSchema.parse(response)).not.toHaveProperty('evaluatedRuleCount');
    expect(riskScanResponseSchema.parse({ ...response, evaluatedRuleCount: 0 })).toHaveProperty(
      'evaluatedRuleCount',
      0,
    );
  });
});
