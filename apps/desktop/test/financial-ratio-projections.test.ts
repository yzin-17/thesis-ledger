import { expect, it } from 'vitest';
import { signedPercent } from '../src/features/performance/performance-display';
import { performanceReturnDisplay } from '../src/features/performance/performance-return-display';
import { riskEventValueLabel } from '../src/features/risk/risk.format';

it.each([
  [0, '+0.00%'],
  [1 / 3, '+33.33%'],
  [0.01005, '+1.01%'],
  [-0.01005, '-1.01%'],
  [1e-9, '+1E-7%'],
  [-1e-9, '-1E-7%'],
  [Number.MIN_VALUE, '+5E-322%'],
  [Number.MAX_VALUE, '+1.797693E310%'],
  [NaN, '—'],
  [Infinity, '—'],
] as const)('带符号收益 %s 保留原符号并展示为 %s', (value, expected) => {
  expect(signedPercent(value)).toBe(expected);
});
it.each([
  [0.01005, '1.01%'],
  [1e-9, '1E-7%'],
  [-1e-9, '-1E-7%'],
  [Number.MIN_VALUE, '5E-322%'],
  [Number.MAX_VALUE, '1.797693E310%'],
] as const)('收益摘要实际投影 %s 展示为 %s', (value, expected) => {
  const result = performanceReturnDisplay({ ttwror: value, xirr: value }, 2, undefined, undefined);
  expect(result.ttwrorValue).toBe(expected);
  expect(result.xirrValue).toBe(expected);
});
it('快照不足、独立原因和读取失败继续保留', () => {
  const result = performanceReturnDisplay(
    { ttwror: 1e-9, xirr: null, xirrReason: '缺少现金流边界' },
    1,
    undefined,
    undefined,
  );
  expect(result.ttwrorValue).toBe('—');
  expect(result.xirrValue).toBe('—');
  expect(result.xirrDetail).toBe('缺少现金流边界');
  const failed = performanceReturnDisplay({ ttwror: 1e-9, xirr: 1e-9 }, 2, '读取失败', undefined);
  expect(failed.ttwrorValue).toBe('1E-7%');
  expect(failed.ttwrorDetail).toBe('读取失败');
});
it.each(['distance_to_cost', 'weight', 'drawdown', 'chip_main_peak'])(
  '风险指标 %s 保留非零比例',
  (valueMetric) => {
    const result = riskEventValueLabel({ value: -1e-9, metadata: { valueMetric } });
    expect(result).toContain('-1E-7%');
  },
);
it.each(['costPrice', 'weight', 'accountWeight', 'observations', 'mainPeak'])(
  '旧事件 %s 回退保持比例语义',
  (key) => {
    expect(riskEventValueLabel({ value: 1e-9, inputs: { [key]: 1 } })).toContain('1E-7%');
  },
);
it('非比例风险指标保持原单位，非法指标仍不展示', () => {
  expect(riskEventValueLabel({ value: 71, metadata: { valueMetric: 'rsi' } })).toBe('RSI 71');
  expect(riskEventValueLabel({ value: NaN, metadata: { valueMetric: 'weight' } })).toBeNull();
});
