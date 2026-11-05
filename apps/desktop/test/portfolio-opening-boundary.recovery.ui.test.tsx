// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { TradeDetailResponse } from '@thesis-ledger/api-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfirmDialogProvider } from '../src/components/ui/confirm-dialog.js';
import { PortfolioTradeDetailDialog } from '../src/features/portfolio/PortfolioTradeDetailDialog.js';
import * as api from '../src/features/portfolio/portfolio-trade.api.js';

vi.mock('../src/features/portfolio/portfolio-trade.api.js', () => ({
  fetchPortfolioTrade: vi.fn(),
  fetchPortfolioTrades: vi.fn(),
  createPortfolioTradeOpeningBoundary: vi.fn(),
}));
vi.mock('../src/components/ui/toast', () => ({ useToastManager: () => ({ add: vi.fn() }) }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
Object.assign(window, { PointerEvent: MouseEvent });

const detail: TradeDetailResponse = {
  id: 'trade-boundary',
  accountId: 'account-boundary',
  accountMode: 'shadow',
  symbol: '510300.SH',
  assetName: '边界验收',
  lifecycle: 'ACTIVE',
  exitProgress: 'NONE',
  endEvidence: 'UNKNOWN',
  openedAt: null,
  closedAt: null,
  earliestEvidenceAt: '2026-01-02T00:00:00.000Z',
  sourceQuantity: '100',
  closedQuantity: '0',
  remainingQuantity: '100',
  grossRealizedPnl: null,
  netRealizedPnl: null,
  realizedNetReturnRate: null,
  costEstimated: true,
  completeness: 'PARTIAL',
  issues: ['MISSING_OPENING_BOUNDARY'],
  costIssues: [],
  algorithmVersion: 'trade-projection-v1',
  projectionFingerprint: null,
  projectionGeneration: '1',
  excludedReasons: [],
  entryLegs: [],
  baselineComponents: [
    {
      id: 'component-1',
      eventId: 'event-1',
      factId: 'fact-1',
      batchId: 'batch-1',
      batchScope: 'FULL',
      occurredAt: '2026-01-02T00:00:00.000Z',
      currency: 'CNY',
      observedQuantity: '100',
      quantity: '100',
      remainingQuantity: '100',
      averageCost: '4',
      rawCost: '400',
      remainingCost: '400',
      rawCostEstimated: true,
      costIncludesFees: 'UNKNOWN',
      reconciledExecutionFactIds: [],
      reconciliationFactIds: [],
    },
  ],
  corporateActions: [],
  closeSlices: [],
  dividendAttributions: [],
  evidenceSources: [],
};
let root: Root;
let client: QueryClient;
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
const buttons = (label: string) =>
  [...document.querySelectorAll<HTMLButtonElement>('button')].filter(
    (button) => button.textContent?.trim() === label,
  );
async function click(label: string) {
  await act(async () => buttons(label).at(-1)!.click());
}
async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}
async function fill(selector: string, value: string) {
  await act(async () => {
    const input = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)!;
    const prototype =
      input.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
}
async function submit() {
  await act(async () =>
    document
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
  );
}
function Harness() {
  const [open, setOpen] = useState(true);
  return (
    <PortfolioTradeDetailDialog
      trade={detail}
      accounts={[]}
      mode="shadow"
      open={open}
      onOpenChange={setOpen}
      onReview={vi.fn()}
    />
  );
}
async function mount() {
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <ConfirmDialogProvider>
          <Harness />
        </ConfirmDialogProvider>
      </QueryClientProvider>,
    ),
  );
  await flush();
}
async function openFilled() {
  await click('补录建仓时间');
  await fill('#trade-opening-boundary-at', '2025-12-30T09:30');
  await fill('#trade-opening-boundary-reason', '来自受控历史账单');
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.fetchPortfolioTrade).mockResolvedValue(detail);
});
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  client?.clear();
  document.body.innerHTML = '';
});

describe('期初边界补录与详情恢复', () => {
  it('提交单飞且锁住字段，失败保留输入与原命令意图', async () => {
    const write = deferred<Awaited<ReturnType<typeof api.createPortfolioTradeOpeningBoundary>>>();
    vi.mocked(api.createPortfolioTradeOpeningBoundary).mockReturnValueOnce(write.promise);
    await mount();
    await openFilled();
    await act(async () => {
      const form = document.querySelector('form')!;
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    expect(api.createPortfolioTradeOpeningBoundary).toHaveBeenCalledTimes(1);
    expect(document.querySelector<HTMLInputElement>('#trade-opening-boundary-at')!.disabled).toBe(
      true,
    );
    expect(
      document.querySelector<HTMLTextAreaElement>('#trade-opening-boundary-reason')!.disabled,
    ).toBe(true);
    expect(buttons('取消').at(-1)!.disabled).toBe(true);
    await act(async () => write.reject(new Error('受控写入失败')));
    expect(document.body.textContent).toContain('受控写入失败');
    expect(
      document.querySelector<HTMLTextAreaElement>('#trade-opening-boundary-reason')!.value,
    ).toBe('来自受控历史账单');
  });

  it('写入成功后等待读取；读取失败不关闭、不再写，只读恢复后关闭', async () => {
    const read = deferred<TradeDetailResponse>();
    vi.mocked(api.fetchPortfolioTrade)
      .mockResolvedValueOnce(detail)
      .mockReturnValueOnce(read.promise)
      .mockResolvedValue(detail);
    vi.mocked(api.createPortfolioTradeOpeningBoundary).mockResolvedValue({
      idempotentReplay: false,
    } as Awaited<ReturnType<typeof api.createPortfolioTradeOpeningBoundary>>);
    await mount();
    await openFilled();
    await submit();
    await flush();
    expect(buttons('取消').at(-1)!.disabled).toBe(true);
    await act(async () => read.reject(new Error('受控详情读取失败')));
    await flush();
    expect(document.body.textContent).toContain('补录已保存');
    expect(document.body.textContent).toContain('无需再次补录');
    expect(buttons('重新读取交易')).toHaveLength(1);
    expect(
      document.querySelector<HTMLTextAreaElement>('#trade-opening-boundary-reason')!.value,
    ).toBe('来自受控历史账单');
    await click('重新读取交易');
    await flush();
    expect(api.createPortfolioTradeOpeningBoundary).toHaveBeenCalledTimes(1);
    expect(api.fetchPortfolioTrade).toHaveBeenCalledTimes(3);
    expect(document.querySelector('#trade-opening-boundary-reason')).toBeNull();
  });

  it('草稿关闭可取消；详情重读失败时不提供旧边界写入口', async () => {
    await mount();
    await openFilled();
    await click('取消');
    expect(document.body.textContent).toContain('放弃未保存');
    await click('继续编辑');
    expect(
      document.querySelector<HTMLTextAreaElement>('#trade-opening-boundary-reason')!.value,
    ).toBe('来自受控历史账单');
    await click('取消');
    await click('放弃修改并关闭');
    vi.mocked(api.fetchPortfolioTrade).mockRejectedValueOnce(new Error('详情陈旧'));
    await act(async () => client.invalidateQueries());
    await flush();
    expect(document.body.textContent).toContain('交易详情读取失败');
    expect(buttons('补录建仓时间').some((button) => !button.disabled)).toBe(false);
    await click('重试读取');
    await flush();
    expect(buttons('补录建仓时间')[0]!.disabled).toBe(false);
  });
});
