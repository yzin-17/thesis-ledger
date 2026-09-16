import type { ReactElement, ReactNode } from 'react';
import { isValidElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  changedToggleOption,
  MarketIndicatorSettingsMenu,
  type MarketIndicatorDraft,
} from './MarketIndicatorSettingsMenu.js';

const draft: MarketIndicatorDraft = { fast: '12', slow: '26', signal: '9' };
type TestElement = ReactElement<Record<string, unknown>>;

const createProps = () => ({
  visibleIndicators: ['MA', 'MACD'] as ('MA' | 'MACD' | 'RSI')[],
  visibleMA: ['ma5', 'ma20'] as ('ma5' | 'ma10' | 'ma20' | 'ma60')[],
  rsiPeriod: 12 as const,
  macdDraft: draft,
  macdDraftError: 'MACD 参数必须为 2–200 的整数，且快线小于慢线。',
  onIndicatorChange: vi.fn(),
  onVisibleMAChange: vi.fn(),
  onRsiPeriodChange: vi.fn(),
  onMacdDraftChange: vi.fn(),
  onApplyMacdParams: vi.fn(),
  onResetMacdParams: vi.fn(),
});

function collectElements(node: ReactNode): TestElement[] {
  if (!isValidElement(node)) return [];
  const children = (node.props as { children?: ReactNode }).children;
  return [node as TestElement, ...collectChildren(children)];
}

function collectChildren(children: ReactNode): TestElement[] {
  if (Array.isArray(children)) return children.flatMap(collectElements);
  return collectElements(children);
}

function collectText(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(collectText).join('');
  if (!isValidElement(node)) return '';
  return collectText((node.props as { children?: ReactNode }).children);
}

function elementWithProp(elements: TestElement[], key: string, value: unknown) {
  const element = elements.find((candidate) => candidate.props[key] === value);
  if (!element) throw new Error(`Missing element with ${key}`);
  return element;
}

describe('MarketIndicatorSettingsMenu', () => {
  it('渲染四个设置分区、MACD 可见标签、错误及窄视口滚动契约', () => {
    const props = createProps();
    const html = renderToStaticMarkup(<MarketIndicatorSettingsMenu {...props} />);
    const text = collectText(MarketIndicatorSettingsMenu(props));

    expect(html).toContain('指标');
    expect(html).toContain('data-indicator-menu-chevron="true"');
    expect(html).toContain('group-aria-expanded/button:rotate-180');
    expect(text).toContain('指标设置');
    expect(text).toContain('显示内容');
    expect(text).toContain('MACD 参数');
    expect(text).toContain('RSI 周期');
    expect(text).toContain('均线周期');
    expect(text).toContain('快线');
    expect(text).toContain('慢线');
    expect(text).toContain('信号');
    expect(text).toContain('MACD 参数必须为 2–200 的整数，且快线小于慢线。');
    expect(text).toContain('应用参数');
    expect(text).toContain('恢复 12/26/9');

    const elements = collectElements(MarketIndicatorSettingsMenu(props));
    const content = elementWithProp(elements, 'aria-label', '指标设置');
    expect(content.props.className).toContain('w-[min(22rem,calc(100vw-2rem))]');
    expect(content.props.className).toContain('max-h-[min(32rem,var(--available-height))]');
    expect(content.props.className).toContain('overflow-x-hidden overflow-y-auto');
  });

  it('保留当前选中、MA 禁用和所有设置回调', () => {
    const props = createProps();
    const elements = collectElements(MarketIndicatorSettingsMenu(props));
    const displayGroup = elementWithProp(elements, 'aria-label', '显示内容');
    const rsiGroup = elementWithProp(elements, 'aria-label', 'RSI 周期');
    const maGroup = elementWithProp(elements, 'aria-label', '均线周期');

    expect(displayGroup.props.value).toEqual(['MA', 'MACD']);
    expect(rsiGroup.props.value).toEqual(['12']);
    expect(maGroup.props.value).toEqual(['ma5', 'ma20']);
    expect(elementWithProp(elements, 'value', 'ma5').props.disabled).toBe(false);

    (displayGroup.props.onValueChange as (values: string[]) => void)(['MA', 'MACD', 'RSI']);
    (rsiGroup.props.onValueChange as (values: string[]) => void)(['24']);
    (maGroup.props.onValueChange as (values: string[]) => void)(['ma5']);
    (elementWithProp(elements, 'id', 'market-macd-fast').props.onChange as (event: {
      target: { value: string };
    }) => void)({ target: { value: '8' } });
    (elementWithProp(elements, 'children', '应用参数').props.onClick as () => void)();
    (elementWithProp(elements, 'children', '恢复 12/26/9').props.onClick as () => void)();

    expect(props.onIndicatorChange).toHaveBeenCalledWith('RSI', true);
    expect(props.onRsiPeriodChange).toHaveBeenCalledWith(24);
    expect(props.onVisibleMAChange).toHaveBeenCalledWith('ma20', false);
    expect(props.onMacdDraftChange).toHaveBeenCalledWith('fast', '8');
    expect(props.onApplyMacdParams).toHaveBeenCalledOnce();
    expect(props.onResetMacdParams).toHaveBeenCalledOnce();

    const disabled = collectElements(
      MarketIndicatorSettingsMenu({ ...props, visibleIndicators: ['MACD'], visibleMA: ['ma5'] }),
    );
    expect(elementWithProp(disabled, 'value', 'ma5').props.disabled).toBe(true);
  });

  it('只向父级回传本次 ToggleGroup 改变的选项', () => {
    expect(changedToggleOption(['MA', 'MACD'], ['MA', 'MACD', 'RSI'], ['MA', 'MACD', 'RSI'])).toEqual({
      name: 'RSI',
      checked: true,
    });
    expect(changedToggleOption(['ma5', 'ma20'], ['ma5'], ['ma5', 'ma10', 'ma20', 'ma60'])).toEqual({
      name: 'ma20',
      checked: false,
    });
  });
});
