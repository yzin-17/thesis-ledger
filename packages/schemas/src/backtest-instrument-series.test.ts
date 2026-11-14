import { describe, expect, it } from 'vitest';
import { backtestInstrumentSeriesSchema } from './backtest-instrument-series.js';

const available = {
  schemaVersion: '1',
  runId: '00000000-0000-4000-8000-000000000080',
  status: 'available',
  source: {
    symbol: '00700.HK',
    currency: 'HKD',
    adjustment: 'hfq',
    timeframe: '1d',
    timezone: 'Asia/Hong_Kong',
    providerId: 'futu',
    upstreamSource: 'futu',
    snapshotId: 'snapshot',
    artifactHash: 'hash',
    dataAsOf: '2026-11-11T08:00:00Z',
  },
  points: [
    { occurredAt: '2026-11-10T08:00:00Z', close: '123.4567890123456789' },
    { occurredAt: '2026-11-11T08:00:00Z', close: null },
  ],
};
describe('回测冻结标的走势合同', () => {
  it('保留原始十进制与缺口，拒绝无来源和无效价格', () => {
    expect(backtestInstrumentSeriesSchema.parse(available)).toEqual(available);
    expect(
      backtestInstrumentSeriesSchema.safeParse({ ...available, source: undefined }).success,
    ).toBe(false);
    expect(
      backtestInstrumentSeriesSchema.safeParse({
        ...available,
        points: [{ occurredAt: 'invalid', close: 'NaN' }],
      }).success,
    ).toBe(false);
  });
  it('不可用必须提供稳定原因，不能混入伪造的价格点', () => {
    const unavailable = {
      schemaVersion: '1',
      runId: available.runId,
      status: 'unavailable',
      reason: 'ARTIFACT_UNAVAILABLE',
      message: '冻结价格文件缺失',
    };
    expect(backtestInstrumentSeriesSchema.safeParse(unavailable).success).toBe(true);
    expect(
      backtestInstrumentSeriesSchema.safeParse({ ...unavailable, points: available.points })
        .success,
    ).toBe(false);
  });
});
