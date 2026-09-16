import type { ReactElement, ReactNode } from 'react';
import { isValidElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { MarketChartNavigationControls } from './MarketChartNavigationControls.js';

type TestElement = ReactElement<Record<string, unknown>>;

function collectElements(node: ReactNode): TestElement[] {
  if (!isValidElement(node)) return [];
  const children = (node.props as { children?: ReactNode }).children;
  const descendants = Array.isArray(children)
    ? children.flatMap(collectElements)
    : collectElements(children);
  return [node as TestElement, ...descendants];
}

describe('MarketChartNavigationControls', () => {
  it('在统一按钮组中呈现四个可访问图标动作', () => {
    const props = {
      onZoomIn: vi.fn(),
      onZoomOut: vi.fn(),
      onPanEarlier: vi.fn(),
      onPanLater: vi.fn(),
    };
    const tree = MarketChartNavigationControls(props);
    const html = renderToStaticMarkup(tree);
    const elements = collectElements(tree);
    const actions = [
      ['放大图表', props.onZoomIn],
      ['缩小图表', props.onZoomOut],
      ['查看更早日期', props.onPanEarlier],
      ['查看更晚日期', props.onPanLater],
    ] as const;

    expect(html).toContain('data-market-chart-navigation="true"');
    expect(html).toContain('aria-label="图表导航"');
    expect(html).toContain('inline-flex h-8 items-center');
    actions.forEach(([label, callback]) => {
      const button = elements.find((element) => element.props['aria-label'] === label);
      expect(button?.props.title).toBe(label);
      (button?.props.onClick as (() => void) | undefined)?.();
      expect(callback).toHaveBeenCalledOnce();
    });
  });
});
