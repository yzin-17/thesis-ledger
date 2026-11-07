// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfirmDialogProvider } from '../src/components/ui/confirm-dialog';
import { RiskRuleEditorSheet } from '../src/features/risk/RiskRuleEditorSheet';
import { precisionRiskRule, riskAccount, riskPosition } from './risk-threshold.fixture';
import type { RiskRuleRecord } from '../src/features/risk/risk.types';

let root: Root;
let host: HTMLDivElement;
const save = vi.fn();
const close = vi.fn();
const threshold = () => document.querySelector<HTMLInputElement>('#risk-rule-threshold')!;
const button = (name: string) =>
  [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (item) => item.textContent?.trim() === name,
  )!;
async function click(name: string) {
  await act(async () => button(name).click());
}
async function fill(value: string) {
  await act(async () => {
    threshold().focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
      threshold(),
      value,
    );
    threshold().dispatchEvent(new Event('input', { bubbles: true }));
  });
}
async function mount(rule: RiskRuleRecord = precisionRiskRule()) {
  await act(async () =>
    root.render(
      <ConfirmDialogProvider>
        <RiskRuleEditorSheet
          open
          rule={rule}
          accounts={[riskAccount]}
          positions={[riskPosition]}
          pending={false}
          onOpenChange={close}
          onSubmit={save}
        />
      </ConfirmDialogProvider>,
    ),
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  save.mockResolvedValue(false);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
describe('风险阈值原值与提交', () => {
  it.each([1 / 3, 0.26645084677376735, 1e-9, Number.MIN_VALUE])(
    '不编辑阈值 %s 保留原值',
    async (value) => {
      await mount(precisionRiskRule(value));
      await click('保存修改');
      expect(save).toHaveBeenCalledOnce();
      expect(save.mock.calls[0]![0].threshold).toBe(value);
    },
  );
  it('只切换严重级别仍提交完整阈值', async () => {
    await mount();
    await click('严重');
    await click('保存修改');
    expect(save).toHaveBeenCalledOnce();
    expect(save.mock.calls[0]![0]).toMatchObject({ threshold: 1 / 3, severity: 'critical' });
  });
  it('失焦压缩、聚焦还原，不因焦点变化要求放弃草稿', async () => {
    await mount();
    await act(async () => threshold().blur());
    expect(threshold().value).toBe('33.333333');
    await act(async () => threshold().focus());
    expect(threshold().value).toBe('33.33333333333333');
    await act(async () => threshold().blur());
    await click('取消');
    expect(document.querySelector('[role="alertdialog"]')).toBeNull();
    expect(close).toHaveBeenCalledWith(false);
    expect(save).not.toHaveBeenCalled();
  });
  it('失败保留完整输入，下溢与零阈值不提交', async () => {
    await mount();
    const raw = '26.645084677376735123456789';
    await fill(raw);
    await click('保存修改');
    await act(async () => threshold().focus());
    expect(threshold().value).toBe(raw);
    expect(save).toHaveBeenCalledOnce();
    save.mockClear();
    await fill('1e-323');
    await click('保存修改');
    expect(save).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('请输入有效阈值。');
    await fill('0');
    await click('保存修改');
    expect(save).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('大于 0');
  });
  it('数值规则也保留未编辑原值', async () => {
    await mount({ ...precisionRiskRule(123.45678901234567), kind: 'price-below' });
    await click('保存修改');
    expect(save.mock.calls[0]![0].threshold).toBe(123.45678901234567);
  });
});
