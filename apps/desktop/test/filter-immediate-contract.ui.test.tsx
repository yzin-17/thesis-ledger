// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ArenaCatalogControls } from '../src/features/model-arena/ArenaCatalogControls.js';
import { readArenaCatalogParams } from '../src/features/model-arena/arena-catalog-navigation.js';
import { RiskOverviewEvents } from '../src/features/risk/RiskOverviewEvents.js';

let container: HTMLDivElement;
let root: Root;
let currentSearch: string;

function LocationProbe() {
  const location = useLocation();
  currentSearch = location.search;
  return null;
}

async function mount(node: ReactNode) {
  await act(async () => {
    root.render(node);
    await Promise.resolve();
  });
}

async function advance(ms: number) {
  await act(async () => {
    vi.advanceTimersByTime(ms);
    await Promise.resolve();
  });
}

async function fill(label: string, value: string) {
  const input = container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);
  expect(input, `输入 ${label}`).not.toBeNull();
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input!.dispatchEvent(new Event('input', { bubbles: true }));
    await Promise.resolve();
  });
}

async function pressEnter(label: string) {
  const input = container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
  await act(async () => {
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await Promise.resolve();
  });
}

function buttonLabels() {
  return [...container.querySelectorAll('button')].map(
    (button) => button.textContent?.trim() ?? '',
  );
}

async function click(text: string) {
  const button = [...container.querySelectorAll('button')].find(
    (candidate) => candidate.textContent?.trim() === text,
  );
  expect(button, `按钮 ${text}`).not.toBeUndefined();
  await act(async () => {
    button!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.useFakeTimers();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  currentSearch = '';
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
    await Promise.resolve();
  });
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('即时筛选行：改了就生效，不渲染搜索按钮', () => {
  const riskPage = (
    <MemoryRouter initialEntries={['/risk']}>
      <LocationProbe />
      <RiskOverviewEvents events={[]} loadState="empty" />
    </MemoryRouter>
  );

  it('风险事件：无搜索按钮，输入防抖 300ms 后写进 URL，连续输入只落末值', async () => {
    await mount(riskPage);
    expect(buttonLabels()).not.toContain('搜索');
    expect(buttonLabels()).toContain('清空筛选');

    await fill('搜索风险事件', 'Gem');
    expect(currentSearch).toBe('');
    await advance(299);
    expect(currentSearch).toBe('');
    await advance(1);
    expect(currentSearch).toContain('eventSearch=Gem');

    await fill('搜索风险事件', 'Gemma');
    await advance(300);
    expect(currentSearch).toContain('eventSearch=Gemma');
    expect(currentSearch).not.toContain('eventSearch=Gem&');
  });

  it('风险事件：回车立即生效，不等防抖', async () => {
    await mount(riskPage);
    await fill('搜索风险事件', 'Gemma');
    await pressEnter('搜索风险事件');
    expect(currentSearch).toContain('eventSearch=Gemma');
  });

  it('风险事件：清空筛选清掉关键词与级别', async () => {
    await mount(
      <MemoryRouter initialEntries={['/risk?eventSearch=Gemma&eventSeverity=error']}>
        <LocationProbe />
        <RiskOverviewEvents events={[]} loadState="empty" />
      </MemoryRouter>,
    );
    expect(buttonLabels()).not.toContain('搜索');
    await click('清空筛选');
    expect(currentSearch).not.toContain('eventSearch');
    expect(currentSearch).not.toContain('eventSeverity');
  });

  it('比赛目录：无搜索按钮，输入防抖后只回调末值，清空筛选可用', async () => {
    const onChange = vi.fn();
    const onClear = vi.fn();
    const query = readArenaCatalogParams(new URLSearchParams());
    await mount(<ArenaCatalogControls query={query} onChange={onChange} onClear={onClear} />);
    expect(buttonLabels()).not.toContain('搜索');
    expect(buttonLabels()).toContain('清空筛选');

    await fill('搜索比赛', 'Gem');
    await fill('搜索比赛', 'Gemma');
    await advance(299);
    expect(onChange).not.toHaveBeenCalled();
    await advance(1);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('search', 'Gemma');

    const reset = [...container.querySelectorAll('button')].find(
      (button) => button.textContent?.trim() === '清空筛选',
    )!;
    expect(reset.disabled).toBe(false);
    await click('清空筛选');
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('比赛目录：回车立即提交，不等防抖', async () => {
    const onChange = vi.fn();
    const query = readArenaCatalogParams(new URLSearchParams());
    await mount(
      <ArenaCatalogControls
        query={query}
        onChange={onChange}
        onClear={vi.fn()}
      />,
    );
    await fill('搜索比赛', 'Gemma');
    await pressEnter('搜索比赛');
    expect(onChange).toHaveBeenCalledWith('search', 'Gemma');
  });
});
