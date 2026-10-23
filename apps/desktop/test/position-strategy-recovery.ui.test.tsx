// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createMemoryRouter, RouterProvider, useLocation, useNavigate } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThesisLedgerApiError } from '@thesis-ledger/api-client';
import { ConfirmDialogProvider } from '../src/components/ui/confirm-dialog.js';
import { NavigationGuardProvider } from '../src/features/shared/navigation-guard.js';
import { PortfolioManagement } from '../src/features/portfolio/PortfolioManagement.js';
import { StrategyEditorPage } from '../src/features/strategy/StrategyEditorPage.js';
import { StrategyEditorSheet } from '../src/features/strategy/StrategyEditorSheet.js';
import { BacktestSetupDialog } from '../src/features/strategy/BacktestSetupDialog.js';
import { BacktestPricePreparation } from '../src/features/strategy/BacktestPricePreparation.js';
import { useStrategyQueries } from '../src/features/strategy/strategy.queries.js';
import { createDefaultStrategySchema, setStrategyExecutionSymbol } from '../src/features/strategy/strategy.schema.js';

const api = vi.hoisted(() => ({ savePosition: vi.fn(), strategies: vi.fn(), create: vi.fn(), version: vi.fn(), toast: vi.fn(), prepare: vi.fn() }));
vi.mock('../src/features/portfolio/portfolio.api', async (original) => ({ ...(await original<object>()), savePosition: api.savePosition }));
vi.mock('../src/features/strategy/strategy.api', async (original) => ({
  ...(await original<object>()), fetchStrategies: api.strategies, fetchBacktestJobs: async () => [],
  createStrategy: api.create, createStrategyVersion: api.version,
}));
vi.mock('../src/features/strategy/strategy.preparation', async (original) => ({ ...(await original<object>()), useBacktestPreparation: api.prepare }));
vi.mock('../src/components/ui/toast', () => ({ useToastManager: () => ({ add: api.toast }) }));
vi.mock('../src/features/strategy/BacktestModelConfiguration', () => ({ BacktestModelConfiguration: () => null }));
vi.mock('../src/features/strategy-authoring/AuthoringRunIntents', () => ({ AuthoringRunIntents: () => null }));
vi.mock('../src/features/strategy-authoring/AuthoringWorkPage', () => ({ AuthoringWorkPage: () => null }));
const account = { id: 'account', name: '验收账户', type: 'securities' as const, mode: 'shadow' as const, currency: 'CNY' as const };
const position = { id: 'position', accountId: account.id, symbol: '510300.SH', quantity: 200, costPrice: 4, marketValue: 800, pnl: 0, asset: { name: '验收 ETF', assetType: 'etf' as const } };
const schema = setStrategyExecutionSymbol(createDefaultStrategySchema('验收策略'), '510300.SH');
const strategy = { id: 'strategy', name: '验收策略', versions: [{ id: 'version', version: 1, schema }] };
const cleanups: Array<() => void> = [];
const NativeRequest = globalThis.Request;
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  vi.stubGlobal('Request', class extends NativeRequest {
    constructor(input: RequestInfo | URL, init?: RequestInit) {
      super(input, init ? { ...init, signal: undefined } : undefined);
    }
  });
  api.strategies.mockResolvedValue([strategy]);
  api.create.mockResolvedValue({ ...strategy, id: 'created' });
  api.version.mockResolvedValue({ id: 'created-version', version: 2, schema });
  api.savePosition.mockResolvedValue({});
  api.prepare.mockReturnValue({ data: undefined, error: null, stale: false, isFetching: false });
});
afterEach(async () => {
  await act(async () => cleanups.splice(0).forEach((fn) => fn()));
  vi.unstubAllGlobals();
});
async function mount(node: React.ReactNode) {
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  cleanups.push(() => { root.unmount(); client.clear(); host.remove(); });
  await act(async () => root.render(<QueryClientProvider client={client}><ConfirmDialogProvider>{node}</ConfirmDialogProvider></QueryClientProvider>));
  return client;
}
async function wait(check: () => void) {
  await vi.waitFor(async () => { await act(async () => new Promise((done) => setTimeout(done, 0))); check(); });
}
const button = (text: string) => {
  const found = [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === text);
  if (!found) throw new Error(`缺少按钮：${text}`);
  return found;
};
async function click(text: string) { await act(async () => button(text).click()); }
async function fill(selector: string, value: string) {
  const input = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)!;
  await act(async () => {
    const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

describe('持仓与策略写入恢复', () => {
  it('快照失败保留输入，重试等待读取且关闭被保护，读取失败仍保持写入成功', async () => {
    let finishRead!: () => void;
    const reading = new Promise<void>((resolve) => { finishRead = resolve; });
    const onSaved = vi.fn(() => reading);
    await mount(<PortfolioManagement accounts={[account]} positions={[position]} step="position" showCash={false} calibrationMode onSaved={onSaved} />);
    await click('修改快照');
    await fill('input[name="quantity"]', '201');
    api.savePosition.mockRejectedValueOnce(new Error('503'));
    await act(async () => document.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    await wait(() => expect(api.toast).toHaveBeenCalledWith(expect.objectContaining({ title: '持仓快照更新失败' })));
    expect(document.querySelector<HTMLInputElement>('input[name="quantity"]')!.value).toBe('201');
    await click('取消'); await click('继续编辑');
    await act(async () => document.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    await wait(() => expect(onSaved).toHaveBeenCalledOnce());
    expect(button('保存中…').disabled).toBe(true);
    await click('取消');
    expect(document.body.textContent).toContain('修改持仓快照');
    await act(async () => finishRead());
    await wait(() => expect(document.querySelector('form')).toBeNull());
    expect(api.savePosition).toHaveBeenCalledTimes(2);
    expect(api.toast).toHaveBeenLastCalledWith(expect.objectContaining({ title: '持仓快照已更新' }));
  });

  it.each(['create', 'edit'] as const)('策略%s保存后的读取失败不丢失写入结果，恢复只读取', async (mode) => {
    let finishRead!: () => void;
    const reading = new Promise<never>((_resolve, reject) => { finishRead = () => reject(new Error('503')); });
    function Screen() {
      const { strategies } = useStrategyQueries();
      const location = useLocation();
      const navigate = useNavigate();
      const saved = !location.pathname.endsWith('/edit') && !location.pathname.endsWith('/new');
      return <>
        {saved ? <p>已定位保存结果 {location.pathname}</p> : <StrategyEditorPage strategies={strategies.data ?? []} loading={strategies.isPending} mode={mode} />}
        {strategies.isError && <button onClick={() => void strategies.refetch()}>重新读取</button>}
        <button onClick={() => void navigate('/away')}>离开页面</button>
        <output>{JSON.stringify(strategies.data)}</output>
      </>;
    }
    const actualRouter = createMemoryRouter([
      { path: '/strategy/library/new', element: <NavigationGuardProvider><Screen /></NavigationGuardProvider> },
      { path: '/strategy/library/:strategyId/versions/:versionId/*', element: <NavigationGuardProvider><Screen /></NavigationGuardProvider> },
    ], { initialEntries: [mode === 'create' ? '/strategy/library/new' : '/strategy/library/strategy/versions/version/edit'] });
    cleanups.push(() => actualRouter.dispose());
    await mount(<RouterProvider router={actualRouter} />);
    await wait(() => expect(document.querySelector('#strategy-description')).not.toBeNull());
    if (mode === 'create') await fill('#strategy-name', '验收策略');
    // 创建表单默认无标的，使用有效高级配置。
    if (mode === 'create') {
      await click('高级 JSON');
      const area = document.querySelector<HTMLTextAreaElement>('#strategy-json')!;
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(area, JSON.stringify(schema));
        area.dispatchEvent(new Event('input', { bubbles: true }));
      });
    }
    const save = mode === 'create' ? api.create : api.version;
    save.mockRejectedValueOnce(new ThesisLedgerApiError(503, { error: 'CONTROLLED_FAILURE', message: '写入暂不可用' }));
    await click(mode === 'create' ? '创建策略' : '保存为新版本');
    await wait(() => expect(document.body.textContent).toContain('服务暂时无法完成本次操作，请稍后重试。'));
    expect(document.body.textContent).not.toContain('ThesisLedger API 503');
    api.strategies.mockImplementationOnce(() => reading);
    await click(mode === 'create' ? '创建策略' : '保存为新版本');
    await wait(() => expect(button('保存中…').disabled).toBe(true));
    await click('取消');
    expect(document.body.textContent).not.toContain('已定位保存结果');
    await click('离开页面');
    await wait(() => expect(api.toast).toHaveBeenCalledWith(expect.objectContaining({ title: '操作尚未完成' })));
    expect(document.body.textContent).not.toContain('已定位保存结果');
    await act(async () => finishRead());
    await wait(() => expect(document.body.textContent).toContain('已定位保存结果'));
    expect(document.body.textContent).toContain(mode === 'create' ? 'created' : 'created-version');
    api.strategies.mockResolvedValue(mode === 'create' ? [{ ...strategy, id: 'created' }] : [{ ...strategy, versions: [...strategy.versions, { id: 'created-version', version: 2, schema }] }]);
    await click('重新读取');
    await wait(() => expect(document.body.textContent).not.toContain('重新读取'));
    expect(save).toHaveBeenCalledTimes(2);
  });

  it('准备请求失败和路由过期可显示错误，不因 Field 上下文崩溃', async () => {
    api.prepare.mockReturnValue({ data: undefined, error: new Error('配置准备暂不可用'), stale: true, isFetching: false });
    await mount(<BacktestPricePreparation strategyVersionId="version" adjustment="none" period={{ start: '2024-01-02', end: '2024-03-29' }} initialCash="10000" currency="CNY" onPrepared={() => undefined} />);
    expect(document.body.textContent).toContain('配置准备暂不可用');
    expect(document.body.textContent).toContain('路由配置已经改变');
  });

  it('重新读取同一版本不会重置正在编辑的草稿', async () => {
    function Editor() {
      const [version, setVersion] = useState(strategy.versions[0]!);
      return <>
        <button onClick={() => setVersion(structuredClone(version))}>重读同一版本</button>
        <StrategyEditorSheet open mode="edit" presentation="page" strategy={strategy} version={version} busy={false} onOpenChange={() => undefined} onSave={() => undefined} />
      </>;
    }
    await mount(<Editor />);
    await fill('#strategy-description', '待保存的本地草稿');
    await click('重读同一版本');
    expect(document.querySelector<HTMLTextAreaElement>('#strategy-description')!.value).toBe('待保存的本地草稿');
  });

  it('回测设置修改后取消需确认，继续编辑保留金额', async () => {
    function Setup() {
      const [open, setOpen] = useState(true);
      return <BacktestSetupDialog open={open} onOpenChange={setOpen} strategy={strategy} version={strategy.versions[0]!} busy={false} onSubmit={async () => false} />;
    }
    await mount(<Setup />);
    await fill('#backtest-cash', '123456');
    await click('取消');
    expect(document.body.textContent).toContain('放弃未保存的修改');
    await click('继续编辑');
    expect(document.querySelector<HTMLInputElement>('#backtest-cash')!.value).toBe('123456');
  });
});
