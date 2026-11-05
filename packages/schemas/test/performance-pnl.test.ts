import { describe, expect, it } from 'vitest';
import { performancePnlPointSchema, performancePnlQuerySchema } from '../src/performance-pnl.js';

describe('累计盈亏契约', () => {
  it('拒绝非法模式、账户与时间范围', () => {
    expect(performancePnlQuerySchema.safeParse({ mode: 'all' }).success).toBe(false);
    expect(performancePnlQuerySchema.safeParse({ accountId: 'unknown' }).success).toBe(false);
    expect(performancePnlQuerySchema.safeParse({ range: '1D' }).success).toBe(false);
    expect(performancePnlQuerySchema.safeParse({ symbol: '000001' }).success).toBe(false);
    expect(performancePnlQuerySchema.safeParse({ symbol: '000001.OF', asOf: 'invalid' }).success).toBe(false);
    expect(performancePnlQuerySchema.safeParse({ symbol: '000001.OF', asOf: '2026-11-04T01:00:00Z' }).success).toBe(true);
  });
  it('未知历史必须保留 null，零盈亏是有效值', () => {
    const point = {
      at: '2026-11-01T08:00:00Z',
      value: null,
      unrealizedPnl: null,
      realizedPnl: null,
      sourceSnapshotId: 's1',
      reason: 'price_unavailable',
    };
    expect(performancePnlPointSchema.safeParse(point).success).toBe(true);
    expect(performancePnlPointSchema.safeParse({ ...point, value: 0 }).success).toBe(false);
    expect(performancePnlPointSchema.safeParse({ ...point, value: 0, reason: null }).success).toBe(
      true,
    );
  });
});
