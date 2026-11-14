import { describe, expect, it } from 'vitest';
import { backtestInstrumentSeriesSchema } from '@thesis-ledger/schemas';
import { projectBacktestInstrumentChart } from '../src/features/strategy/backtest-instrument-chart.model.js';

const id = '00000000-0000-4000-8000-000000000080';
const series = backtestInstrumentSeriesSchema.parse({
  schemaVersion: '1',
  runId: id,
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
    artifactHash: 'artifact',
    dataAsOf: '2026-11-11T08:00:00Z',
  },
  points: [
    { occurredAt: '2026-11-09T08:00:00Z', close: '1234.567890123456789' },
    { occurredAt: '2026-11-10T08:00:00Z', close: null },
    { occurredAt: '2026-11-11T08:00:00Z', close: '0.0000000000000000000000000000000000000001' },
  ],
});
describe('回测标的图表投影', () => {
  it('仅将唯一的日线价格对齐同日期权益，不改变原始时间或跨日补点', () => {
    const original = structuredClone(series);
    const daily = {
      ...series,
      points: [{ occurredAt: '2026-11-09T00:00:00+08:00', close: '123.45' }],
    };
    const time = Date.parse('2026-11-09T08:00:00Z');
    expect(projectBacktestInstrumentChart(id, 'snapshot', daily, [{ time }])).toMatchObject({
      points: [{ time, timestamp: daily.points[0]!.occurredAt, close: '123.45' }],
    });
    for (const candidate of [
      { ...daily, source: { ...daily.source, timeframe: '1m' as const } },
      {
        ...daily,
        points: [...daily.points, { occurredAt: '2026-11-09T01:00:00+08:00', close: '124' }],
      },
    ])
      expect(projectBacktestInstrumentChart(id, 'snapshot', candidate, [{ time }])).toMatchObject({
        points: [
          { time: Date.parse(daily.points[0]!.occurredAt) },
          ...candidate.points.slice(1).map((p) => ({ time: Date.parse(p.occurredAt) })),
        ],
      });
    expect(
      projectBacktestInstrumentChart(id, 'snapshot', daily, [{ time: time + 86400000 }]),
    ).toMatchObject({ points: [{ time: Date.parse(daily.points[0]!.occurredAt) }] });
    expect(
      projectBacktestInstrumentChart(id, 'snapshot', daily, [{ time }, { time: time + 1000 }]),
    ).toMatchObject({ points: [{ time: Date.parse(daily.points[0]!.occurredAt) }] });
    expect(series).toEqual(original);
  });
  it('保留原始小数和缺口，仅为绘图转换数值', () => {
    const original = structuredClone(series);
    const chart = projectBacktestInstrumentChart(id, 'snapshot', series);
    expect(chart).toMatchObject({
      status: 'available',
      points: [
        { close: '1234.567890123456789', value: expect.any(Number) },
        { close: null, value: null },
        { close: series.points[2]!.close, value: expect.any(Number) },
      ],
    });
    expect(series).toEqual(original);
  });
  it('拒绝其他任务与快照的序列，保留具体不可用原因', () => {
    expect(projectBacktestInstrumentChart('other', 'snapshot', series)?.status).toBe('unavailable');
    expect(projectBacktestInstrumentChart(id, 'other', series)?.status).toBe('unavailable');
    expect(
      projectBacktestInstrumentChart(id, 'snapshot', {
        schemaVersion: '1',
        runId: id,
        status: 'unavailable',
        reason: 'ARTIFACT_UNAVAILABLE',
        message: '冻结价格文件缺失',
      }),
    ).toEqual({ status: 'unavailable', message: '冻结价格文件缺失' });
  });
});
