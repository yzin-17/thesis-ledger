import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { AllocationWeight } from '../src/features/performance/AllocationWeight.js';

it.each([-0.8367346938775511, 1.836734693877551])(
  '异常权重 %s 保留真实比例且不伪装成普通进度',
  (value) => {
    const markup = renderToStaticMarkup(<AllocationWeight value={value} label="当前权重" />);
    expect(markup).toContain(`${(value * 100).toFixed(2)}%`);
    expect(markup).not.toContain('role="progressbar"');
  },
);

it('正常权重继续显示精确比例及可访问进度', () => {
  const markup = renderToStaticMarkup(<AllocationWeight value={0.625} label="基金当前权重" />);
  expect(markup).toContain('62.50%');
  expect(markup).toContain('aria-valuenow="62.5"');
});

it('不可用权重不显示旧进度', () => {
  const markup = renderToStaticMarkup(
    <AllocationWeight value={0.625} label="基金当前权重" unavailable />,
  );
  expect(markup).toContain('—');
  expect(markup).not.toContain('62.50%');
});
