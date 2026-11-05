// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfirmDialogProvider } from '../src/components/ui/confirm-dialog.js';
import { ProviderCredentialsSheet } from '../src/features/market-data/ProviderCredentialsSheet.js';
import { StrategyRiskApplicationPage } from '../src/features/strategy/StrategyRiskApplicationPage.js';
import { StrategyExperimentDetailPage } from '../src/features/strategy/StrategyExperimentDetailPage.js';
import { StrategyExperimentCreatePage } from '../src/features/strategy/StrategyExperimentCreatePage.js';
import { createDefaultStrategySchema, setStrategyExecutionSymbol } from '../src/features/strategy/strategy.schema.js';
import { marketDataKeys } from '../src/features/market-data/market-data.queries.js';
import type { ProviderManifest } from '../src/features/market-data/market-data.types.js';
import type { OptimizationExperimentSummary } from '../src/features/strategy/strategy-optimization.api.js';
import fixture from './fixtures/experiment-risk-ui-recovery.json';

const api = vi.hoisted(() => ({ save: vi.fn(), clear: vi.fn(), probe: vi.fn(), providers: vi.fn(), accounts: vi.fn(), applications: vi.fn(), preview: vi.fn(), riskSave: vi.fn(), detail: vi.fn(), compare: vi.fn(), clone: vi.fn(), cancel: vi.fn(), finalize: vi.fn(), adopt: vi.fn(), adoption: vi.fn(), toast: vi.fn(), close: vi.fn(), capabilities: vi.fn(), parameters: vi.fn(), create: vi.fn() }));
vi.mock('../src/features/market-data/market-data.api', async (original) => ({ ...(await original<object>()), saveMarketProviderCredentials: api.save, clearMarketProviderCredential: api.clear, testMarketProvider: api.probe, fetchMarketProviders: api.providers }));
vi.mock('../src/features/portfolio/portfolio.api', async (original) => ({ ...(await original<object>()), fetchAccounts: api.accounts }));
vi.mock('../src/features/risk/risk.queries', () => ({ useNotificationRoutingQuery: () => ({ isPending: false, isError: false, data: { routes: [] } }) }));
vi.mock('../src/features/strategy/strategy-optimization.api', async (original) => ({
  ...(await original<object>()), fetchStrategyRiskApplications: api.applications, previewStrategyRiskApplication: api.preview, createStrategyRiskApplication: api.riskSave,
  fetchOptimizationExperiment: api.detail, fetchOptimizationCompare: api.compare, cloneOptimizationExperiment: api.clone, cancelOptimizationExperiment: api.cancel, finalizeOptimizationExperiment: api.finalize,
  adoptOptimizationCandidate: api.adopt, fetchOptimizationAdoptionContext: api.adoption,
  fetchOptimizationCapabilities: api.capabilities, fetchStrategyOptimizationParameters: api.parameters, createOptimizationExperiment: api.create,
}));
// 只隔离配置准备子组件；创建表单、路由、mutation 和后续读取使用实际实现。
vi.mock('../src/features/strategy/OptimizationPricePreparation', () => ({ OptimizationPricePreparation: ({ target, startDate, endDate, initialCash, currency, onPrepared }: { target: unknown; startDate: string; endDate: string; initialCash: string; currency: string; onPrepared: (value: unknown) => void }) => <button onClick={() => onPrepared({ target, result: { runConfig: { startDate, endDate, baseCurrency: currency, initialCash: { [currency]: initialCash } } } })}>受控准备完成</button> }));
vi.mock('../src/components/ui/toast', () => ({ useToastManager: () => ({ add: api.toast, close: api.close }) }));
const version = { id: fixture.experiment.baselineStrategyVersionId, version: 1, schemaVersion: 2, schema: setStrategyExecutionSymbol(createDefaultStrategySchema('恢复验收策略'), '600519.SH') };
const strategy = { id: 'strategy', name: '恢复验收策略', versions: [version] };
const provider: ProviderManifest = { providerId: 'tushare', displayName: 'Tushare', version: 1, configVersion: 1, configured: true, enabled: true, credentialConfigured: true, credentialSource: 'control', credentialMethod: 'token', credentialFieldsConfigured: { token: true }, requiresCredential: true, capabilities: {}, credentialSchema: { methods: [{ method: 'token', fields: [{ name: 'token', secret: true, required: true }] }] } };
const experiment = fixture.experiment as unknown as OptimizationExperimentSummary;
const cleanups: Array<() => void> = [];
const NativeRequest = globalThis.Request;
beforeEach(() => {
  vi.resetAllMocks(); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  api.toast.mockReturnValue('controlled-error-toast');
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  vi.stubGlobal('Request', class extends NativeRequest { constructor(input: RequestInfo | URL, init?: RequestInit) { super(input, init ? { ...init, signal: undefined } : undefined); } });
  api.providers.mockResolvedValue([provider]); api.save.mockResolvedValue({ ...provider, configVersion: 2 });
  api.clear.mockResolvedValue({ ...provider, configVersion: 3, credentialConfigured: false });
  api.accounts.mockResolvedValue([fixture.account]); api.applications.mockResolvedValue([]); api.preview.mockResolvedValue(fixture.riskPreview);
  api.detail.mockResolvedValue({ experiment, candidates: [fixture.candidate], attempts: [] });
  api.compare.mockResolvedValue({ experiment, baseline: { metrics: {}, runRefs: {} }, candidates: [fixture.candidate], attempts: [] });
  api.clone.mockResolvedValue(experiment); api.cancel.mockResolvedValue(experiment); api.finalize.mockResolvedValue(experiment);
  api.adoption.mockResolvedValue({ baseline: version, current: version, candidateVsBaseline: [], candidateVsCurrent: [], expectedStrategyVersion: 1 });
  api.adopt.mockResolvedValue({ strategyVersion: { id: 'adopted', strategyId: strategy.id, version: 2 } });
  api.capabilities.mockResolvedValue({ aiOptimizationEnabled: true, riskApplicationsEnabled: true, providers: [{ provider: 'controlled', model: 'fixture', costStatus: 'known', costCurrency: 'CNY' }] });
  api.parameters.mockResolvedValue([{ parameterId: 'sizing.value', label: '仓位', value: 10000, optimizationRange: { min: 1000, max: 20000 } }]);
  api.create.mockResolvedValue(experiment);
});
afterEach(async () => { await act(async () => cleanups.splice(0).forEach((fn) => fn())); vi.unstubAllGlobals(); });
async function mount(node: React.ReactNode, route?: string) {
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const router = route ? createMemoryRouter([{ path: '/strategy/library/:strategyId/versions/:versionId/risk-application', element: node }, { path: '/strategy/experiments/new', element: node }, { path: '/strategy/experiments/:experimentId', element: route.endsWith('/new') ? <StrategyExperimentDetailPage strategies={[strategy]} /> : node }, { path: '*', element: <p>返回来源</p> }], { initialEntries: [route] }) : null;
  cleanups.push(() => { root.unmount(); router?.dispose(); client.clear(); host.remove(); });
  await act(async () => root.render(<QueryClientProvider client={client}><ConfirmDialogProvider>{router ? <RouterProvider router={router} /> : node}</ConfirmDialogProvider></QueryClientProvider>));
  return client;
}
async function wait(check: () => void) { await vi.waitFor(async () => { await act(async () => new Promise((done) => setTimeout(done, 0))); check(); }); }
const button = (text: string) => { const b = [...document.querySelectorAll('button,[role="menuitem"]')].find((item) => item.textContent?.trim() === text); if (!b) throw new Error(`缺少操作：${text}`); return b as HTMLButtonElement; };
async function click(text: string) { await act(async () => button(text).click()); }
async function input(value: string) { const field = document.querySelector('input')!; await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(field, value); field.dispatchEvent(new Event('input', { bubbles: true })); }); }

describe('市场配置与策略实验恢复', () => {
  it('实验创建失败保留同一提交意图；确认创建后详情读取失败仍可恢复', async () => {
    await mount(<StrategyExperimentCreatePage strategies={[strategy]} />, '/strategy/experiments/new');
    await wait(() => expect(document.body.textContent).toContain('仓位'));
    expect(document.querySelector('[role="combobox"]')?.textContent).toContain('恢复验收策略 · v1');
    await click('下一步'); await click('下一步'); await click('受控准备完成');
    api.create.mockRejectedValueOnce(new Error('创建受控失败'));
    await click('创建实验'); await wait(() => expect(document.body.textContent).toContain('创建受控失败'));
    api.detail.mockRejectedValue(new Error('503')); api.compare.mockRejectedValue(new Error('503'));
    await click('创建实验'); await wait(() => expect(document.body.textContent).toContain('实验详情或对比读取失败'));
    expect(api.create.mock.calls[0]![0].idempotencyKey).toBe(api.create.mock.calls[1]![0].idempotencyKey);
    expect(document.body.textContent).toContain(experiment.name);
    api.detail.mockResolvedValue({ experiment, candidates: [fixture.candidate], attempts: [] });
    api.compare.mockResolvedValue({ experiment, baseline: { metrics: {}, runRefs: {} }, candidates: [fixture.candidate], attempts: [] });
    await click('重新加载'); await wait(() => expect(document.body.textContent).not.toContain('实验详情或对比读取失败'));
    expect(api.create).toHaveBeenCalledTimes(2);
  });
  it('凭证写入失败保留假值，确认保存后读取失败只 GET 恢复', async () => {
    function Panel() {
      useQuery({ queryKey: marketDataKeys.providers(), queryFn: api.providers });
      return <ProviderCredentialsSheet provider={provider} onClose={() => undefined} />;
    }
    await mount(<Panel />); await click('更换'); await input('controlled-test-only');
    api.save.mockRejectedValueOnce(new Error('503'));
    await click('保存凭证'); await wait(() => expect(document.body.textContent).toContain('凭证保存失败'));
    expect(document.querySelector<HTMLInputElement>('input')!.value).toBe('controlled-test-only');
    api.providers.mockRejectedValue(new Error('503'));
    await click('保存凭证'); await wait(() => expect(document.body.textContent).toContain('配置已保存，数据源状态暂未更新'));
    expect(document.querySelector('input')).toBeNull();
    api.providers.mockResolvedValue([provider]); await click('重新读取数据源状态');
    await wait(() => expect(document.body.textContent).not.toContain('数据源状态暂未更新'));
    expect(api.save).toHaveBeenCalledTimes(2); expect(api.probe).not.toHaveBeenCalled();
  });

  it('风险保存期间关闭无效；成功后读取失败仍保留确认结果，恢复不重写', async () => {
    const saved = { id: 'application', strategyVersionId: version.id, accountId: fixture.account.id, symbol: '600519.SH', cycleMode: 'existingAndFuture', revision: 1, plan: fixture.riskPreview.plan, coverage: fixture.riskPreview.plan.coverage, enabled: false, notification: { enabled: false, channels: [], severity: 'warning', cooldownMinutes: 60 } };
    let complete!: () => void;
    api.riskSave.mockImplementationOnce(() => new Promise((resolve) => { complete = () => resolve(saved); }));
    await mount(<StrategyRiskApplicationPage strategies={[strategy]} presentation="drawer" />, `/strategy/library/strategy/versions/${version.id}/risk-application`);
    await wait(() => expect(button('预览风险规则').disabled).toBe(false)); await click('预览风险规则');
    await wait(() => expect(button('保存为停用').disabled).toBe(false)); await click('保存为停用');
    await wait(() => expect(document.querySelector<HTMLInputElement>('input[max="10080"]')!.disabled).toBe(true));
    await click('关闭');
    expect(document.body.textContent).not.toContain('返回来源');
    api.applications.mockRejectedValue(new Error('503')); await act(async () => complete());
    await wait(() => expect(document.body.textContent).toContain('账户或风险应用读取失败'));
    expect(document.body.textContent).toContain('风险应用已保存'); expect(button('保存为停用').disabled).toBe(true);
    api.applications.mockResolvedValue([saved]); await click('重新读取应用状态');
    await wait(() => expect(document.body.textContent).not.toContain('账户或风险应用读取失败'));
    expect(api.riskSave).toHaveBeenCalledOnce();
  });

  it('账户请求失败不显示为没有账户，重读后恢复预览', async () => {
    api.accounts.mockRejectedValue(new Error('503'));
    await mount(<StrategyRiskApplicationPage strategies={[strategy]} presentation="drawer" />, `/strategy/library/strategy/versions/${version.id}/risk-application`);
    await wait(() => expect(document.body.textContent).toContain('账户或风险应用读取失败'));
    expect(document.body.textContent).not.toContain('没有可用实际证券账户');
    api.accounts.mockResolvedValue([fixture.account]); await click('重新读取应用状态');
    await wait(() => expect(button('预览风险规则').disabled).toBe(false));
  });

  it.each(['克隆实验', '取消实验', '锁定并运行封存测试', '确认采纳'])('%s确认后读取失败不遮蔽结果，恢复只读', async (action) => {
    if (action === '确认采纳') {
      const completed = { ...experiment, status: 'succeeded', stage: 'completed' };
      api.detail.mockResolvedValue({ experiment: completed, candidates: [fixture.candidate], attempts: [] });
      api.compare.mockResolvedValue({ experiment: completed, baseline: { metrics: {}, runRefs: {} }, candidates: [fixture.candidate], attempts: [] });
    }
    await mount(<StrategyExperimentDetailPage strategies={[strategy]} />, `/strategy/experiments/${experiment.id}`);
    await wait(() => expect(document.body.textContent).toContain(experiment.name));
    if (action === '确认采纳') { await click('审阅并采纳'); await wait(() => expect(button('确认采纳')).toBeDefined()); }
    if (action === '克隆实验' || action === '取消实验') {
      await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="实验更多操作"]')!.click());
      await wait(() => expect(button(action)).toBeDefined());
    }
    const mutation = { 克隆实验: api.clone, 取消实验: api.cancel, 锁定并运行封存测试: api.finalize, 确认采纳: api.adopt }[action]!;
    mutation.mockRejectedValueOnce(new Error('受控写入失败'));
    await click(action);
    await wait(() => expect(api.toast).toHaveBeenCalledWith(expect.objectContaining({ type: 'error' })));
    if (action === '克隆实验' || action === '取消实验') {
      await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="实验更多操作"]')!.click());
    }
    api.detail.mockRejectedValue(new Error('503')); api.compare.mockRejectedValue(new Error('503'));
    await click(action);
    await wait(() => expect(document.body.textContent).toContain('无需重复提交'));
    expect(document.body.textContent).toContain(experiment.name);
    api.detail.mockResolvedValue({ experiment, candidates: [fixture.candidate], attempts: [] });
    api.compare.mockResolvedValue({ experiment, baseline: { metrics: {}, runRefs: {} }, candidates: [fixture.candidate], attempts: [] });
    await click('重新加载'); await wait(() => expect(document.body.textContent).not.toContain('读取失败，请先重新读取'));
    expect(mutation).toHaveBeenCalledTimes(2);
    expect(api.close).toHaveBeenCalledWith('controlled-error-toast');
  });
});
