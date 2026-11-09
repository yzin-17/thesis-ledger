// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { InfoTip } from './info-tip.js';

let container: HTMLDivElement;
let root: Root;
const description = '确认前不会改变持仓或现金。';

beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<InfoTip label="定投确认说明">{description}</InfoTip>);
    await Promise.resolve();
  });
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
    await Promise.resolve();
  });
  container.remove();
  vi.unstubAllGlobals();
});

it('说明可通过键盘聚焦读取，并可用 Escape 收起', async () => {
  const trigger = container.querySelector('button')!;
  expect(trigger.getAttribute('aria-label')).toBe('定投确认说明');
  expect(trigger.getAttribute('aria-description')).toBe(description);
  await act(async () => {
    trigger.focus();
    await new Promise((resolve) => setTimeout(resolve, 200));
  });
  expect(document.querySelector('[data-slot="hover-card-content"]')?.textContent).toBe(description);
  await act(async () => {
    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await Promise.resolve();
  });
  expect(trigger.getAttribute('aria-expanded')).toBe('false');
});

it('触屏点击也能打开说明', async () => {
  const trigger = container.querySelector('button')!;
  await act(async () => {
    trigger.click();
    await Promise.resolve();
  });
  expect(trigger.getAttribute('aria-expanded')).toBe('true');
  expect(document.querySelector('[data-slot="hover-card-content"]')?.textContent).toBe(description);
});
