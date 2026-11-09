import { describe, expect, it } from 'vitest';
import { measureChartValues } from './chart-measurement-model.js';

const points = [{ key: '2026-11-02', value: 1 }, { key: '2026-11-04', value: 1.1 }, { key: '2026-11-06', value: 1.2 }];

describe('图表数值区间测量', () => {
  it('使用真实记录计数，反向保留选择方向，不将缺失日期补成记录', () => {
    const original = JSON.stringify(points);
    expect(measureChartValues(points, '2026-11-02', '2026-11-06')).toMatchObject({ fromPrice: 1, toPrice: 1.2, count: 3 });
    expect(measureChartValues(points, '2026-11-02', '2026-11-06')!.percent).toBeCloseTo(20);
    const reverse = measureChartValues(points, '2026-11-06', '2026-11-02')!;
    expect(reverse.count).toBe(3);
    expect(reverse.difference).toBeCloseTo(-0.2);
    expect(reverse.percent).toBeCloseTo(-16.6666667);
    expect(JSON.stringify(points)).toBe(original);
  });
  it('同一点、零起点和缺失日期分别表达', () => {
    expect(measureChartValues(points, '2026-11-04', '2026-11-04')).toMatchObject({ count: 1, difference: 0, percent: 0 });
    expect(measureChartValues([{ key: 'a', value: 0 }, { key: 'b', value: 1 }], 'a', 'b')).toMatchObject({ difference: 1, percent: null });
    expect(measureChartValues(points, '2026-11-03', '2026-11-06')).toBeUndefined();
    expect(measureChartValues(points, null, null)).toBeUndefined();
  });
});
