import { describe, expect, it } from 'vitest';
import {
  performanceCalculateInputSchema,
  performanceSummaryResponseSchema,
  performanceTargetsInputSchema,
} from '../src/index.js';

describe('收益正确性合同兼容', () => {
  const accountId = '10000000-0000-4000-8000-000000000001';
  it('账户目标需要账户身份，组合目标不接受账户身份', () => {
    expect(
      performanceTargetsInputSchema.safeParse({ scope: 'account', targets: { stock: 1 } }).success,
    ).toBe(false);
    expect(
      performanceTargetsInputSchema.safeParse({
        scope: 'portfolio',
        accountId,
        targets: { stock: 1 },
      }).success,
    ).toBe(false);
    expect(
      performanceTargetsInputSchema.safeParse({
        scope: 'account',
        accountId,
        targets: { stock: 1 },
      }).success,
    ).toBe(true);
    expect(
      performanceTargetsInputSchema.safeParse({ scope: 'portfolio', targets: { stock: 1 } })
        .success,
    ).toBe(true);
  });
  it('新旧收益响应保持可读，新增不可用原因不会被丢弃', () => {
    const old = {
      accountId: null,
      snapshots: [],
      ttwror: null,
      xirr: null,
      xirrReason: '历史原因',
    };
    expect(performanceSummaryResponseSchema.parse(old)).toEqual(old);
    expect(
      performanceSummaryResponseSchema.parse({ ...old, ttwrorReason: '缺少现金流边界' })
        .ttwrorReason,
    ).toBe('缺少现金流边界');
  });
  it('API 保留现金流边界证据与零净额事件数，拒绝非有限边界', () => {
    const input = {
      valuations: [
        {
          date: '2025-01-02T00:00:00Z',
          value: 200,
          externalFlow: 100,
          externalFlowCount: 1,
          flowBoundary: { before: 100, after: 200 },
        },
      ],
      cashFlows: [],
    };
    expect(performanceCalculateInputSchema.parse(input)).toEqual(input);
    input.valuations[0]!.flowBoundary.before = Infinity;
    expect(performanceCalculateInputSchema.safeParse(input).success).toBe(false);
  });
});
