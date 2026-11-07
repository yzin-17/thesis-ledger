import { expect, it } from 'vitest';
import { formatRatioPercent } from '../src/ratio-percent.js';

it.each([
  [null, '—'],
  [undefined, '—'],
  [NaN, '—'],
  [Infinity, '—'],
  [-Infinity, '—'],
  [0, '0.00%'],
  [-0, '0.00%'],
  [1 / 3, '33.33%'],
  [-1 / 3, '-33.33%'],
  [0.01005, '1.01%'],
  [-0.01005, '-1.01%'],
  [2.25, '225.00%'],
  [1e-9, '1E-7%'],
  [-1e-9, '-1E-7%'],
  [Number.MIN_VALUE, '5E-322%'],
  [-Number.MIN_VALUE, '-5E-322%'],
  [Number.MAX_VALUE, '1.797693E310%'],
  [-Number.MAX_VALUE, '-1.797693E310%'],
  [1e19, '1E21%'],
  [0.0000499, '4.99E-3%'],
] as const)('比例 %s 展示为 %s', (value, expected) => {
  expect(formatRatioPercent(value)).toBe(expected);
});
