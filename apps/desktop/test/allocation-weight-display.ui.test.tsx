import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { AllocationWeight } from '../src/features/performance/AllocationWeight.js';

it.each([
  [0, '0.00%'],
  [1 / 3, '33.33%'],
  [0.01005, '1.01%'],
  [1e-9, '1E-7%'],
  [-1e-9, '-1E-7%'],
  [Number.MIN_VALUE, '5E-322%'],
  [Number.MAX_VALUE, '1.797693E310%'],
  [2.25, '225.00%'],
] as const)('实际权重 %s 保留非零和精确展示 %s', (value, expected) => {
  const html = renderToStaticMarkup(<AllocationWeight label="当前权重" value={value} />);
  expect(html).toContain(expected);
});

it.each([-0.25, 2.25])('权重 %s 只显示实际值，不渲染普通进度条', (value) => {
  const html = renderToStaticMarkup(<AllocationWeight label="当前权重" value={value} />);
  expect(html).not.toContain('role="progressbar"');
});

it.each([0, 1])('权重 %s 保留原范围内的进度条', (value) => {
  const html = renderToStaticMarkup(<AllocationWeight label="当前权重" value={value} />);
  expect(html).toContain('role="progressbar"');
});

it('不可用状态保留占位和进度条隐藏', () => {
  const html = renderToStaticMarkup(<AllocationWeight label="当前权重" value={0.25} unavailable />);
  expect(html).toContain('—');
  expect(html).not.toContain('role="progressbar"');
});
