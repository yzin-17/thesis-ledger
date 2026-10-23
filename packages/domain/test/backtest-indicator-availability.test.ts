import { describe, expect, it } from 'vitest';
import { alignSeriesAt, evaluateIndicator, type BacktestSeriesPoint } from '../src/index.js';

const point = (day: number, value: string): BacktestSeriesPoint => ({
  occurredAt: `2025-01-${String(day).padStart(2, '0')}T00:00:00Z`,
  availableAt: `2025-01-${String(day).padStart(2, '0')}T00:00:00Z`,
  value,
  high: value,
  low: value,
  close: value,
  status: 'available',
});
const input = () => [100, 90, 91, 92, 93].map((value, i) => point(i + 1, String(value)));
const delayed = '2025-01-10T00:00:00Z';

describe('指标依赖时钟的持续与重置', () => {
  it('RSI 与 EMA 均保留递归种子的实际可见时间', () => {
    const rows = input();
    rows[0]!.availableAt = delayed;
    for (const name of ['RSI', 'EMA'] as const) {
      const result = evaluateIndicator(name, rows, { period: 2 }).points.at(-1)!;
      expect(result.availableAt).toBe(delayed);
    }
  });

  it('嵌套表达式保持 availableAt 与显式 researchClock 的独立含义', () => {
    const rows = input();
    rows[0]!.availableAt = delayed;
    rows[0]!.researchClock = {
      basis: 'fixed-provider-snapshot',
      dataAsOf: '2025-01-20T00:00:00Z',
      decisionAt: '2025-01-08T00:00:00Z',
    };
    const rsi = evaluateIndicator('RSI', rows, { period: 2 });
    const nested = evaluateIndicator('EMA', rsi.points, { period: 2 }).points.at(-1)!;
    expect(nested.availableAt).toBe(delayed);
    expect(nested.researchClock?.decisionAt).toBe('2025-01-08T00:00:00Z');
    const series = {
      sourceId: 'test',
      symbol: 'TEST',
      market: 'CN' as const,
      assetType: 'stock' as const,
      field: 'close' as const,
      timeframe: '1d' as const,
      adjusted: false,
      points: [nested],
    };
    expect(alignSeriesAt(series, [rows.at(-1)!.occurredAt])[0]!.status).toBe('unavailable');
  });

  it('中断后 RSI 与 ATR 清除旧依赖，并各自完成重新预热', () => {
    const rows = [1, 2, 3, 4, 5, 6].map((day) => point(day, String(100 + day)));
    rows[0]!.availableAt = '2025-01-20T00:00:00Z';
    rows[2]!.status = 'unavailable';
    for (const name of ['RSI', 'ATR'] as const) {
      const values = evaluateIndicator(name, rows, { period: 2 }).points;
      expect(values[2]!.status).toBe('unavailable');
      expect(values[3]!.status).toBe('unavailable');
      expect(values[4]!.status).toBe('unavailable');
      expect(values[5]!.status).toBe('available');
      expect(values[5]!.availableAt).toBe(rows[5]!.availableAt);
    }
  });

  it('ATR 不接受无效 OHLC 或不可用前收字段', () => {
    const rows = [point(1, '100'), point(2, '11')];
    rows[0]!.status = 'unavailable';
    rows[1]!.high = '12';
    rows[1]!.low = '10';
    expect(evaluateIndicator('ATR', rows, { period: 1 }).points[1]!.status).toBe('unavailable');
    rows[0]!.status = 'available';
    rows[1]!.high = 'NaN';
    expect(evaluateIndicator('ATR', rows, { period: 1 }).points[1]!.status).toBe('unavailable');
  });

  it('追加未来输入不改写过去的数值或依赖时钟', () => {
    const rows = input();
    rows[0]!.availableAt = delayed;
    for (const name of ['RSI', 'ATR', 'EMA'] as const) {
      const prefix = evaluateIndicator(name, rows, { period: 2 }).points;
      const whole = evaluateIndicator(name, [...rows, point(6, '200')], { period: 2 }).points;
      expect(whole.slice(0, rows.length)).toEqual(prefix);
    }
  });
});
