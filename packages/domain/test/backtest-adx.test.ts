import { describe, expect, it } from 'vitest';
import { evaluateIndicator, indicatorRequiredLookback } from '../src/index.js';
const points = (values: number[]) =>
  values.map((value, index) => ({
    occurredAt: new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
    availableAt: new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
    status: 'available' as const,
    value: String(value),
    close: String(value),
    high: String(value + 1),
    low: String(value - 1),
  }));

describe('Wilder ADX 与方向分量', () => {
  it('全上涨样本的独立值：+DI=50，−DI=0，ADX=100，在第 2N 根初始化', () => {
    const input = points([10, 11, 12, 13, 14, 15]);
    const params = { period: 2 };
    expect(indicatorRequiredLookback('ADX', params)).toBe(4);
    const adx = evaluateIndicator('ADX', input, params, { output: 'adx' });
    expect(adx.points[2]?.status).toBe('unavailable');
    expect(adx.points[3]?.value).toBe('100');
    expect(evaluateIndicator('ADX', input, params, { output: 'plusDI' }).points.at(-1)?.value).toBe(
      '50',
    );
    expect(
      evaluateIndicator('ADX', input, params, { output: 'minusDI' }).points.at(-1)?.value,
    ).toBe('0');
  });

  it('全下跌与平价样本不混淆方向；零振幅 ADX 明确定义为零', () => {
    const input = points([15, 14, 13, 12, 11]);
    expect(
      evaluateIndicator('ADX', input, { period: 2 }, { output: 'minusDI' }).points.at(-1)?.value,
    ).toBe('50');
    expect(
      evaluateIndicator('ADX', input, { period: 2 }, { output: 'plusDI' }).points.at(-1)?.value,
    ).toBe('0');
    expect(
      evaluateIndicator(
        'ADX',
        points([10, 10, 10, 10]),
        { period: 2 },
        { output: 'adx' },
      ).points.at(-1)?.value,
    ).toBe('0');
  });

  it('坏样本重置平滑，延迟观测通过递归状态传播可见时间', () => {
    const input = points([10, 11, 12, 13, 14, 15]);
    input[0] = { ...input[0]!, availableAt: '2026-02-01T00:00:00Z' };
    expect(
      evaluateIndicator('ADX', input, { period: 2 }, { output: 'adx' }).points.at(-1)?.availableAt,
    ).toBe('2026-02-01T00:00:00Z');
    const interrupted = input.map((point, index) =>
      index === 3 ? { ...point, status: 'unavailable' as const } : point,
    );
    expect(
      evaluateIndicator('ADX', interrupted, { period: 2 }, { output: 'adx' }).points.at(-1)?.status,
    ).toBe('unavailable');
  });
});
