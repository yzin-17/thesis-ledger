import { describe, expect, it } from 'vitest';
import { comparableSnapshotRowsV3 } from '../../src/backtest/backtest-snapshot-v3-comparable-data.js';

const range = { startDate: '2026-05-18', endDate: '2026-05-20' };
describe('V3 共同区间数据指纹投影', () => {
  it('排除预热价格与整窗指纹，保留真实观测时间', () => {
    expect(
      comparableSnapshotRowsV3(
        'execution/bars.parquet',
        [
          { occurredAt: '2026-05-15T07:00:00Z', close: '1' },
          {
            occurredAt: '2026-05-18T07:00:00Z',
            close: '2',
            inputFingerprint: 'whole-window',
            availableAt: '2026-09-25T00:00:00Z',
          },
        ],
        range,
      ),
    ).toEqual([
      { occurredAt: '2026-05-18T07:00:00Z', close: '2', availableAt: '2026-09-25T00:00:00Z' },
    ]);
  });
  it('日历只取共同区间休市与会话覆盖；预热范围扩展不改变投影', () => {
    const fact = {
      timezone: 'Asia/Shanghai',
      sessions: '[]',
      holidays: '["2026-05-01","2026-05-19"]',
      sessionOverrides: '[]',
      range: '{"start":"2026-05-01","end":"2026-05-20"}',
    };
    const first = comparableSnapshotRowsV3('calendar/CN.parquet', [fact], range);
    const extended = comparableSnapshotRowsV3(
      'calendar/CN.parquet',
      [{ ...fact, range: '{"start":"2026-01-01","end":"2026-05-20"}' }],
      range,
    );
    expect(first).toEqual(extended);
    expect(first[0]?.holidays).toBe('["2026-05-19"]');
    expect(first[0]).not.toHaveProperty('range');
  });
  it('保留期初适用标的事实和区间变化，并忽略可信空事件占位行', () => {
    const facts = [
      { occurredAt: '2023-01-01T00:00:00Z', tickSize: '0.01' },
      { occurredAt: '2024-01-01T00:00:00Z', tickSize: '0.001' },
      { occurredAt: '2026-05-19T00:00:00Z', tickSize: '0.01' },
    ];
    expect(comparableSnapshotRowsV3('instrumentFacts/CN-159516.SZ.parquet', facts, range)).toEqual(
      facts.slice(1),
    );
    expect(
      comparableSnapshotRowsV3(
        'corporateActions/CN-159516.SZ.parquet',
        [{ kind: 'empty-dataset' }],
        range,
      ),
    ).toEqual([]);
  });
});
