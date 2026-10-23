// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfirmDialogProvider } from '../src/components/ui/confirm-dialog.js';
import { CashObservationSheet } from '../src/features/account-data/AccountDataCashObservationSheet.js';
import { CorrectionReasonSheet } from '../src/features/account-data/AccountDataAuditSheets.js';
import { ExecutionFormSheet } from '../src/features/account-data/AccountDataExecutionSheet.js';
import { CashSection } from '../src/features/account-data/AccountDataCashSections.js';
import { RecurringCashDeposits } from '../src/features/account-data/AccountDataRecurringCashDeposits.js';
import { RecurringFundInvestments } from '../src/features/account-data/AccountDataRecurringFundInvestments.js';
import { useAccountLedgerEventsQuery } from '../src/features/account-data/account-data.queries.js';
import { executionDraft } from '../src/features/account-data/account-data.helpers.js';
import { invalidatePortfolioChange } from '../src/features/account-data/portfolio-change.js';
import { portfolioKeys } from '../src/features/portfolio/portfolio.queries.js';

const api = vi.hoisted(() => ({
  events: vi.fn(),
  valuation: vi.fn(),
  observation: vi.fn(),
  plans: vi.fn(),
  occurrences: vi.fn(),
  createPlan: vi.fn(),
  confirm: vi.fn(),
  skip: vi.fn(),
  toast: vi.fn(),
  createExecution: vi.fn(),
  replaceExecution: vi.fn(),
  request: vi.fn(),
  voidExecution: vi.fn(),
  fundPlans: vi.fn(),
  fundOccurrences: vi.fn(),
  fundCreate: vi.fn(),
  fundConfirm: vi.fn(),
  fundSkip: vi.fn(),
}));
vi.mock('../src/shared/api/client', async () => {
  const { ThesisLedgerApiClient } = await import('@thesis-ledger/api-client');
  const client = new ThesisLedgerApiClient('http://controlled.invalid/api/v1', async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const payload = await api.request(`${url.pathname}${url.search}`, init);
    return new Response(JSON.stringify(payload), {
      headers: { 'content-type': 'application/json' },
    });
  });
  return {
    getDesktopApiClient: () => ({
      request: api.request,
      market: client.market,
      ledger: {
        getEvents: api.events,
        createExecution: api.createExecution,
        replaceExecution: api.replaceExecution,
        voidExecution: api.voidExecution,
      },
      cashDeposits: {
        getPlans: api.plans,
        getOccurrences: api.occurrences,
        createPlan: api.createPlan,
        confirmOccurrence: api.confirm,
        skipOccurrence: api.skip,
      },
      fundInvestments: {
        getPlans: api.fundPlans,
        getOccurrences: api.fundOccurrences,
        createPlan: api.fundCreate,
        confirmOccurrence: api.fundConfirm,
        skipOccurrence: api.fundSkip,
      },
    }),
  };
});
vi.mock('../src/features/portfolio/portfolio.api', async (original) => ({
  ...(await original<object>()),
  saveCashBalance: api.observation,
}));
vi.mock('../src/components/ui/toast', () => ({ useToastManager: () => ({ add: api.toast }) }));
const account = {
  id: '11111111-1111-4111-8111-111111111111',
  name: '现金恢复验收',
  type: 'cash' as const,
  mode: 'actual' as const,
  currency: 'CNY' as const,
  active: true,
};
const ledger = { events: [], ledgerRevision: '1' };
const occurrence = {
  id: 'occurrence-1',
  accountId: account.id,
  planName: '验收计划',
  periodKey: '2026-10',
  scheduledFor: '2026-10-01T01:00:00Z',
  expectedAmount: '100',
  currency: 'CNY',
  status: 'PENDING',
  version: 1,
};
const cleanups: Array<() => void> = [];
beforeEach(() => {
  vi.resetAllMocks();
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
  api.events.mockResolvedValue(ledger);
  api.createExecution.mockResolvedValue({} as never);
  api.replaceExecution.mockResolvedValue({} as never);
  api.request.mockResolvedValue([]);
  api.valuation.mockResolvedValue({
    cashByCurrency: [{ currency: 'CNY', amount: 100, convertedAmount: 100 }],
  });
  api.plans.mockResolvedValue([]);
  api.occurrences.mockResolvedValue([occurrence]);
  api.observation.mockResolvedValue({});
  api.createPlan.mockResolvedValue({});
  api.confirm.mockResolvedValue({});
  api.skip.mockResolvedValue({});
  api.fundPlans.mockResolvedValue([]);
  api.fundOccurrences.mockResolvedValue([
    { ...occurrence, symbol: '000001.OF', fundName: '验收基金' },
  ]);
  api.fundCreate.mockResolvedValue({});
  api.fundConfirm.mockResolvedValue({});
  api.fundSkip.mockResolvedValue({});
});
afterEach(async () => {
  await act(async () => {
    cleanups.splice(0).forEach((fn) => fn());
  });
  vi.unstubAllGlobals();
});
function deferred() {
  let reject!: (error: Error) => void;
  const promise = new Promise<never>((_resolve, fail) => {
    reject = fail;
  });
  return { promise, reject };
}
async function mount(node: React.ReactNode) {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  cleanups.push(() => {
    root.unmount();
    client.clear();
    host.remove();
  });
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <ConfirmDialogProvider>{node}</ConfirmDialogProvider>
      </QueryClientProvider>,
    );
  });
}
async function wait(check: () => void) {
  await vi.waitFor(async () => {
    await act(async () => {
      await new Promise((done) => setTimeout(done, 0));
    });
    check();
  });
}
function button(text: string) {
  const found = [...document.querySelectorAll('button')].find(
    (b) => b.textContent?.trim() === text,
  );
  expect(found, text).toBeDefined();
  return found!;
}
async function click(text: string) {
  await act(async () => button(text).click());
}
async function fill(id: string, value: string) {
  const input = document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement;
  expect(input).not.toBeNull();
  await act(async () => {
    const prototype =
      input instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
function CashWorkspace() {
  const client = useQueryClient();
  const events = useAccountLedgerEventsQuery(account.id, 'actual', 'all');
  const valuation = useQuery({
    queryKey: portfolioKeys.valuation('actual', account.id),
    queryFn: api.valuation,
  });
  const [open, setOpen] = useState(true);
  return (
    <>
      <CashSection
        account={account}
        accounts={[account]}
        valuation={valuation.data}
        valuationQuery={valuation as never}
        events={events.data?.events ?? []}
        eventsQuery={events}
        onCalibrate={() => setOpen(true)}
        resolveInstrumentName={() => undefined}
      />
      <CashObservationSheet
        account={account}
        open={open}
        onOpenChange={setOpen}
        onSaved={() =>
          invalidatePortfolioChange(client, {
            mode: 'actual',
            accountIds: [account.id],
            events: true,
            audit: true,
          })
        }
      />
    </>
  );
}

describe('写入与读取故障分离', () => {
  it.each(['cash', 'fund'] as const)(
    '%s 计划首次失败显示未知，读取成功空数组才显示空态',
    async (kind) => {
      const plans = kind === 'fund' ? api.fundPlans : api.plans;
      const occurrences = kind === 'fund' ? api.fundOccurrences : api.occurrences;
      plans.mockRejectedValue(new Error('读取失败'));
      occurrences.mockRejectedValue(new Error('读取失败'));
      if (kind === 'fund')
        await mount(<RecurringFundInvestments account={{ ...account, type: 'fund' }} />);
      else await mount(<RecurringCashDeposits account={account} />);
      const retry = kind === 'fund' ? '重新读取基金定投' : '重新读取定期入账';
      const empty = kind === 'fund' ? '暂无基金定投计划' : '暂无定期入账计划';
      await wait(() => expect(document.body.textContent).toContain(retry));
      expect(document.body.textContent).toContain('—');
      expect(document.body.textContent).not.toContain(empty);
      expect(document.body.textContent).not.toContain('暂无待确认');
      plans.mockResolvedValue([]);
      occurrences.mockResolvedValue([]);
      await click(retry);
      await wait(() => expect(document.body.textContent).toContain(empty));
      expect(document.body.textContent).not.toContain(retry);
    },
  );
  it.each([
    ['新建定投', '创建计划', 'fundCreate'],
    ['确认成交', '写入买入成交', 'fundConfirm'],
    ['跳过', '确认跳过', 'fundSkip'],
  ] as const)(
    '基金客户端 %s 提交/刷新中不能关闭；失败后只重读恢复',
    async (entry, submit, method) => {
      await mount(<RecurringFundInvestments account={{ ...account, type: 'fund' }} />);
      await wait(() => expect(document.body.textContent).toContain('验收基金'));
      await click(entry);
      if (method === 'fundCreate') await fill('fund-plan-symbol', '000001.OF');
      if (method === 'fundConfirm') {
        await fill('fund-actual-quantity', '10');
        await fill('fund-unit-price', '1.2');
      }
      const read = deferred();
      api.fundPlans.mockReturnValueOnce(read.promise);
      await click(submit);
      await wait(() => expect(api.fundPlans).toHaveBeenCalledTimes(2));
      await click('关闭');
      expect(document.querySelector('[role="dialog"] [type="submit"]')).not.toBeNull();
      await act(async () => read.reject(new Error('受控基金计划读取失败')));
      await wait(() => expect(document.body.textContent).toContain('基金定投读取失败'));
      await click('重新读取基金定投');
      await wait(() => expect(document.body.textContent).not.toContain('基金定投读取失败'));
      expect(api[method]).toHaveBeenCalledOnce();
    },
  );
  it('成交作废服务端失败显示局部错误，保留原因且不会使页面崩溃', async () => {
    const onOpenChange = vi.fn();
    await mount(
      <CorrectionReasonSheet
        account={account}
        action="void"
        ledgerRevision="1"
        onOpenChange={onOpenChange}
        target={{ eventId: 'event-1', type: 'BUY_EXECUTION' } as never}
      />,
    );
    await fill('correction-reason', '保留此原因');
    api.voidExecution.mockRejectedValueOnce(new Error('受控作废失败'));
    await click('确认作废');
    await wait(() => expect(document.body.textContent).toContain('受控作废失败'));
    expect((document.getElementById('correction-reason') as HTMLTextAreaElement).value).toBe(
      '保留此原因',
    );
    expect(onOpenChange).not.toHaveBeenCalled();
  });
  it('现金快照写入失败保留输入；成功后等待刷新，读取失败只重读且不重复写入', async () => {
    await mount(<CashWorkspace />);
    await wait(() => expect(api.events).toHaveBeenCalledOnce());
    await fill('cash-observation-amount', '123.45');
    api.observation.mockRejectedValueOnce(new Error('受控写入失败'));
    await click('记录现金快照');
    await wait(() => expect(document.body.textContent).toContain('受控写入失败'));
    expect((document.getElementById('cash-observation-amount') as HTMLInputElement).value).toBe(
      '123.45',
    );
    const read = deferred();
    api.events.mockReturnValueOnce(read.promise);
    await click('记录现金快照');
    await wait(() => expect(api.events).toHaveBeenCalledTimes(2));
    expect(button('记录中…').disabled).toBe(true);
    await click('关闭');
    expect(document.getElementById('cash-observation-amount')).not.toBeNull();
    await act(async () => read.reject(new Error('受控读取失败')));
    await wait(() => expect(document.body.textContent).toContain('现金数据暂未更新'));
    expect(api.toast).toHaveBeenCalledWith(expect.objectContaining({ title: '现金快照已记录' }));
    expect(document.getElementById('cash-observation-amount')).toBeNull();
    await click('重新读取现金数据');
    await wait(() => expect(document.body.textContent).not.toContain('现金数据暂未更新'));
    expect(api.observation).toHaveBeenCalledTimes(2);
    expect(api.events).toHaveBeenCalledTimes(3);
  });

  it.each([
    ['新建计划', '保存计划', 'createPlan'],
    ['确认入账', '确认并写入 Ledger', 'confirm'],
    ['跳过', '确认跳过', 'skip'],
  ] as const)('%s 成功后的计划读取故障可只重读恢复', async (entry, submit, method) => {
    await mount(<RecurringCashDeposits account={account} />);
    await wait(() => expect(document.body.textContent).toContain('验收计划'));
    await click(entry);
    if (method === 'createPlan') await fill('cash-plan-amount', '100');
    const read = deferred();
    api.plans.mockReturnValueOnce(read.promise);
    await click(submit);
    await wait(() => expect(api.plans).toHaveBeenCalledTimes(2));
    expect(button(submit).disabled).toBe(true);
    await click('关闭');
    expect(document.querySelector('[role="dialog"] [type="submit"]')).not.toBeNull();
    await act(async () => read.reject(new Error('受控读取失败')));
    await wait(() => expect(document.body.textContent).toContain('定期入账读取失败'));
    expect(document.querySelector('[role="dialog"] [type="submit"]')).toBeNull();
    await click('重新读取定期入账');
    await wait(() => expect(document.body.textContent).not.toContain('定期入账读取失败'));
    expect(api[method]).toHaveBeenCalledOnce();
    expect(api.plans).toHaveBeenCalledTimes(3);
  });

  it('更正旧 VERIFIED 成交时按未验证提交；写入失败保留输入且不改原事件', async () => {
    const originalEvent = {
      eventId: 'execution-verified-1',
      accountId: account.id,
      type: 'BUY_EXECUTION',
      revisionAction: 'CREATE',
      occurredAt: '2026-10-17T02:00:00.000Z',
      timePrecision: 'INSTANT',
      sourceTimezone: 'Asia/Shanghai',
      economicOrderKey: 'execution-verified-1',
      source: { category: 'MANUAL', channel: 'desktop-account-data', externalId: 'old' },
      payload: {
        symbol: '600000.SH',
        quantity: '10',
        price: '8.25',
        currency: 'CNY',
        capabilityVerification: 'VERIFIED',
        charges: [],
      },
    };
    const onOpenChange = vi.fn();
    const onDirtyChange = vi.fn();
    api.replaceExecution.mockRejectedValueOnce(new Error('受控更正写入失败'));

    await mount(
      <ExecutionFormSheet
        account={{ ...account, type: 'stock' }}
        open
        editingEvent={originalEvent as never}
        ledgerRevision="4"
        onOpenChange={onOpenChange}
        onDirtyChange={onDirtyChange}
      />,
    );
    await fill('execution-quantity', '17.125');
    await fill('execution-price', '8.5');
    await fill('execution-reason', '重新核对本次规则状态');
    await click('提交更正');

    await wait(() => expect(document.body.textContent).toContain('受控更正写入失败'));
    expect(api.replaceExecution).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          quantity: '17.125',
          price: '8.5',
          capabilityVerification: 'UNVERIFIED',
        }),
        reason: '重新核对本次规则状态',
      }),
    );
    expect((document.getElementById('execution-quantity') as HTMLInputElement).value).toBe(
      '17.125',
    );
    expect((document.getElementById('execution-reason') as HTMLTextAreaElement).value).toBe(
      '重新核对本次规则状态',
    );
    expect(originalEvent.payload.capabilityVerification).toBe('VERIFIED');
  });

  it.each([
    { symbol: '600000.SH', name: '浦发银行', market: 'SH', reference: 'unsupported' },
    { symbol: '00700.HK', name: '腾讯控股', market: 'HK', reference: 'failure' },
    { symbol: '00147.HK', name: '验收港股', market: 'HK', reference: 'pending' },
    { symbol: '00941.HK', name: '中国移动', market: 'HK', reference: 'available' },
  ])('新建 $symbol：参考 $reference 不阻断高精度成交，仍提交 UNVERIFIED', async (scenario) => {
    const instrument = {
      id: '60000000-0000-4000-8000-000000000001',
      symbol: scenario.symbol,
      canonicalCode: scenario.symbol.split('.')[0],
      instrumentType: 'STOCK',
      market: scenario.market,
      displayName: scenario.name,
      confirmable: true,
      disabledReason: null,
      generation: 0,
      active: true,
    };
    api.request.mockImplementation(async (path: string) => {
      if (path.startsWith('/api/market-data/instruments/search')) return [instrument];
      if (path.startsWith('/api/market-data/security-lot-size')) {
        if (scenario.reference === 'pending') return new Promise(() => {});
        if (scenario.reference === 'available')
          return {
            contractVersion: 3,
            consumer: 'thesis-ledger',
            requestId: 'reference-test',
            symbol: scenario.symbol,
            sharesPerLot: '100',
            historicalChanges: 'unverified',
            fetchedAt: new Date().toISOString(),
            policyRevision: 1,
            source: {
              provider: 'futu',
              sourceUrl: 'https://openapi.futunn.com/futu-api-doc/quote/get-static-info.html',
              sha256: 'a'.repeat(64),
              observedAt: new Date(Date.now() - 1000).toISOString(),
            },
            routeTarget: { providerId: 'futu', upstreamSource: 'futu', routeIndex: 0 },
          };
        throw new Error('参考来源未就绪');
      }
      return {};
    });
    const onOpenChange = vi.fn();
    const onDirtyChange = vi.fn();

    await mount(
      <ExecutionFormSheet
        account={{ ...account, type: 'stock' }}
        open
        editingEvent={null}
        ledgerRevision="4"
        onOpenChange={onOpenChange}
        onDirtyChange={onDirtyChange}
      />,
    );
    const search = document.querySelector<HTMLInputElement>('input[aria-label="搜索代码或名称"]');
    expect(search).not.toBeNull();
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
        search,
        scenario.symbol,
      );
      search!.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      search!.blur();
      search!.focus();
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 550));
    });
    await wait(() => expect(document.querySelector('[role="option"]')).not.toBeNull());
    const option = document.querySelector<HTMLElement>('[role="option"]');
    expect(option?.textContent).toContain(scenario.name);
    await act(async () => option!.click());
    await wait(() => expect(document.body.textContent).toContain(scenario.name));
    if (scenario.reference !== 'unsupported') {
      await click('查询当前每手参考');
      let message = '每手参考暂不可用';
      if (scenario.reference === 'pending') message = '参考查询中';
      else if (scenario.reference === 'available') message = '当前每手 100 股';
      await wait(() => expect(document.body.textContent).toContain(message));
    }

    await fill('execution-quantity', '25.1256');
    await fill('execution-price', '8.56789');
    await click('记录成交');
    await wait(() => expect(api.createExecution).toHaveBeenCalledOnce());
    expect(api.createExecution).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          symbol: scenario.symbol,
          quantity: '25.1256',
          price: '8.56789',
          capabilityVerification: 'UNVERIFIED',
        }),
      }),
    );
    expect(document.body.textContent).toContain('交易规则未验证');
    expect(executionDraft(null, 'CNY').capabilityVerification).toBe('UNVERIFIED');
  });
});
