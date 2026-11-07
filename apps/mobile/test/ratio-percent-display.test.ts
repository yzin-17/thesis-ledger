import { expect, it } from 'vitest';
import { displayRatio } from '../src/features/performance-read/performance-projection';

it.each([
  [0, '0.00%'],
  [1 / 3, '33.33%'],
  [0.01005, '1.01%'],
  [-0.01005, '-1.01%'],
  [1e-9, '1E-7%'],
  [-1e-9, '-1E-7%'],
  [Number.MIN_VALUE, '5E-322%'],
  [Number.MAX_VALUE, '1.797693E310%'],
  [2.25, '225.00%'],
  [null, '—'],
  [undefined, '—'],
  [NaN, '—'],
  [Infinity, '—'],
] as const)('移动端实际投影 %s 展示为 %s', (value, expected) => {
  expect(displayRatio(value)).toBe(expected);
});
