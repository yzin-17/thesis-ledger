// @vitest-environment jsdom
import { act, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CashResults, RecentCashFlowSection } from './AccountDataCashSections.js';

type ResultsProps = ComponentProps<typeof CashResults>;

const defaults: ResultsProps = {
  account: { id: 'cash-layout', name: '现金账户', type: 'cash', mode: 'actual', currency: 'CNY' },
  valuation: { baseCurrency: 'CNY' } as ResultsProps['valuation'],
  valuationQuery: { isPending: false, isError: false } as ResultsProps['valuationQuery'],
  settledRows: [{ currency: 'CNY', amount: 1160, convertedAmount: 1160 }],
  pendingRows: [],
  settledCashFlowRows: [],
  evidencePartial: false,
  resolveInstrumentName: () => undefined,
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
    await Promise.resolve();
  });
  container.remove();
  vi.unstubAllGlobals();
});

async function renderResults(props: Partial<ResultsProps> = {}) {
  await act(async () => {
    root.render(<CashResults {...defaults} {...props} />);
    await Promise.resolve();
  });
}

describe('现金展示与交互保持', () => {
  it('单币种余额只展示一次，保留紧凑待结算状态和数据完整度', async () => {
    await renderResults();
    expect(container.textContent?.match(/¥1,160\.00/g)).toHaveLength(1);
    expect(container.textContent).not.toContain('本位币合计');
    expect(container.textContent).toContain('现金数据：完整');
    expect(container.textContent).not.toContain('待结算应收0 笔');
    expect(container.textContent).not.toContain('待结算应付0 笔');
    expect(container.textContent).toContain('暂无待结算资金');
    expect(container.querySelector('#cash-pending-title')).toBeNull();
  });

  it('多币种按原币展示，仅在所有折算值可靠时展示本位币合计', async () => {
    const settledRows: ResultsProps['settledRows'] = [
      ...defaults.settledRows,
      { currency: 'USD', amount: 100, convertedAmount: 720 },
    ];
    await renderResults({ settledRows });
    expect(container.textContent).toContain('¥1,160.00CNY');
    expect(container.textContent).toContain('$100.00USD');
    expect(container.textContent).toContain('本位币合计 · CNY ¥1,880.00');

    await renderResults({
      settledRows: [settledRows[0]!, { ...settledRows[1]!, convertedAmount: null }],
      evidencePartial: true,
    });
    expect(container.textContent).toContain('$100.00USD');
    expect(container.textContent).toContain('本位币合计暂不可用（缺少可靠汇率）');
    expect(container.textContent).not.toContain('¥1,880.00');
    expect(container.textContent).toContain('现金数据：部分');
  });

  it('单一外币保留本位币合计，不将原币金额当作合计', async () => {
    await renderResults({ settledRows: [{ currency: 'USD', amount: 100, convertedAmount: 720 }] });
    expect(container.textContent).toContain('$100.00USD');
    expect(container.textContent).toContain('本位币合计 · CNY ¥720.00');
  });

  it('非空待结算保留目录名称、代码、时间、方向、备注和金额', async () => {
    const resolveInstrumentName = vi.fn(() => '目录中的标的名称');
    await renderResults({
      resolveInstrumentName,
      pendingRows: [
        {
          id: 'pending-cash',
          currency: 'CNY',
          amount: 300,
          direction: '应收',
          label: '卖出 600000.SH',
          symbol: '600000.SH',
          note: '结算备注',
          settledAt: '2099-11-06T00:00:00.000Z',
        },
      ],
    });
    expect(resolveInstrumentName).toHaveBeenCalledWith('600000.SH');
    expect(container.textContent).toContain('卖出 目录中的标的名称');
    expect(container.textContent).toContain('600000.SH');
    expect(container.textContent).toContain('11/06');
    expect(container.textContent).toContain('待结算 · 应收');
    expect(container.textContent).toContain('备注：结算备注');
    expect(container.textContent).toContain('+¥300.00');
    expect(container.textContent).not.toContain('暂无待结算资金');
  });

  it('最近流水仍默认五条，查看全部及收起保持可操作', async () => {
    const rows: ResultsProps['settledCashFlowRows'] = Array.from({ length: 7 }, (_, index) => ({
      id: `flow-${index}`,
      currency: 'CNY',
      amount: index + 1,
      direction: '流入',
      label: `入账记录 ${index + 1}`,
      settledAt: '2026-10-23T00:00:00.000Z',
    }));
    await act(async () => {
      root.render(<RecentCashFlowSection rows={rows} />);
      await Promise.resolve();
    });
    const button = container.querySelector('button')!;
    expect(container.textContent).toContain('最近 5 条');
    expect(container.textContent).not.toContain('入账记录 6');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    await act(async () => {
      button.click();
      await Promise.resolve();
    });
    expect(container.textContent).toContain('入账记录 7');
    expect(container.textContent).toContain('最近 7 条');
    expect(button.getAttribute('aria-expanded')).toBe('true');
    await act(async () => {
      button.click();
      await Promise.resolve();
    });
    expect(container.textContent).not.toContain('入账记录 6');
    expect(button.textContent).toBe('查看全部');
  });

  it('加载和首次失败继续显示原状态，失败可重试', async () => {
    await renderResults({
      valuation: undefined,
      valuationQuery: { isPending: true, isError: false } as ResultsProps['valuationQuery'],
    });
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(container.textContent).not.toContain('现金数据：完整');
    const refetch = vi.fn();
    await renderResults({
      valuation: undefined,
      valuationQuery: {
        isPending: false,
        isError: true,
        refetch,
      } as unknown as ResultsProps['valuationQuery'],
    });
    expect(container.textContent).toContain('现金读取失败');
    await act(async () => {
      container.querySelector('button')!.click();
      await Promise.resolve();
    });
    expect(refetch).toHaveBeenCalledOnce();
  });
});
