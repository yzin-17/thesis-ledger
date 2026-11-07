// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { FinancialRatioSamples } from './financial-ratio-samples';
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

it.each([
  [0.01005, '1.01%'],
  [1e-9, '1E-7%'],
  [-1e-9, '-1E-7%'],
  [Number.MIN_VALUE, '5E-322%'],
  [Number.MAX_VALUE, '1.797693E310%'],
] as const)('实际摘要、差额、持仓与事件 %s 使用共同展示', (value, expected) => {
  const markup = renderToStaticMarkup(<FinancialRatioSamples value={value} />);
  for (const name of ['summary', 'allocation', 'portfolio', 'risk']) {
    const element = document.createElement('div');
    element.innerHTML = markup;
    expect(element.querySelector('[data-ratio-' + name + ']')!.textContent).toContain(expected);
  }
  expect(markup).toContain('冻结消息：1.00% · 历史保留');
  expect(markup).not.toContain('Infinity%');
});
it('目标编辑当前权重和走势焦点保留非零，取消编辑不保存', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(() => root.render(<FinancialRatioSamples value={1e-9} />));
    const edit = [...host.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('调整目标'),
    )!;
    expect(edit).toBeDefined();
    await act(() => edit.click());
    expect(document.body.textContent).toContain('当前 1E-7%');
    const cancel = [...document.querySelectorAll('[role=dialog] button')].find((b) =>
      b.textContent?.includes('取消'),
    )!;
    await act(() => cancel.click());
    const svg = host.querySelector<SVGSVGElement>('svg[role=application]')!;
    await act(() => svg.focus());
    expect(host.querySelector('[role=status]')?.textContent).toContain('披露覆盖 1E-7%');
    expect(host.querySelector('[role=status]')?.textContent).toContain('可定价覆盖 1E-7%');
    await act(() =>
      svg.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
    );
    expect(host.querySelector('[role=status]')).toBeNull();
  } finally {
    await act(() => root.unmount());
    host.remove();
  }
});

it('无效的大目标合计使用业务提示，保存继续禁用', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(() => root.render(<FinancialRatioSamples value={Number.MAX_VALUE} />));
    const edit = [...host.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('调整目标'),
    )!;
    await act(() => edit.click());
    const dialog = document.querySelector('[role=dialog]')!;
    expect(dialog.textContent).toContain('超出范围');
    expect(dialog.textContent).not.toContain('Infinity');
    const save = [...dialog.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('保存目标'),
    )!;
    expect(save.disabled).toBe(true);
  } finally {
    await act(() => root.unmount());
    host.remove();
  }
});
