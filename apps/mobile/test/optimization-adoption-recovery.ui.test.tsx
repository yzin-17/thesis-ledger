// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThesisLedgerApiClient } from '@thesis-ledger/api-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getMobileTheme } from '../src/theme';
import { OptimizationAdoptionScreen } from '../src/features/optimization-adoption/OptimizationAdoptionScreen';
import { experiment, id, other, at } from '../../../packages/api-client/test/strategy-management.fixture';
import { researchVersion } from '../../../packages/schemas/test/price-research-fixture';

const runtime = vi.hoisted(() => ({ value: {} as Record<string, unknown>, route: {} as Record<string, string>, store: new Map<string, string>(), failCleanup: false, navigate: vi.fn() }));
vi.mock('react-native', () => vi.importActual('react-native-web'));
vi.mock('@react-navigation/native', () => ({ useRoute: () => ({ params: runtime.route }), useNavigation: () => ({ navigate: runtime.navigate }) }));
vi.mock('expo-crypto', () => ({ randomUUID: () => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }));
vi.mock('../src/app/MobileRuntime', () => ({ useMobileRuntime: () => runtime.value, confirmAction: () => Promise.resolve(true) }));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: {
  getItem: (key: string) => Promise.resolve(runtime.store.get(key) ?? null),
  setItem: (key: string, value: string) => { runtime.store.set(key, value); return Promise.resolve(); },
  removeItem: (key: string) => { if (runtime.failCleanup) return Promise.reject(new Error('受控本地清理失败')); runtime.store.delete(key); return Promise.resolve(); },
} }));

const readable = { state: 'readable', code: 'READABLE', scope: 'test', accessedAt: at, revealedAt: at };
const version = { id, strategyId: id, version: 1, schemaVersion: 3, schema: researchVersion.schema };
const candidate = { id: other, experimentId: id, candidateNumber: 1, modelKey: 'fixture:model', candidateStrategyVersionId: other,
  executionHash: 'candidate-hash', proposal: {}, diff: [], validationStatus: 'test_valid', runRefs: {}, metrics: {}, readEligibility: readable };
const compare = { experiment: { ...experiment, status: 'succeeded', stage: 'completed', readEligibility: readable }, candidates: [candidate], attempts: [], baseline: { runRefs: {}, metrics: {} }, note: '' };
const context = { experimentId: id, candidateId: other, expectedStrategyVersion: 1, baseline: version, current: version,
  candidate: { ...version, id: other, candidateId: other, executionHash: 'candidate-hash' }, candidateVsBaseline: [], candidateVsCurrent: [] };
const receipt = { strategyVersion: { id: other, strategyId: id, version: 2 }, source: { experimentId: id, candidateId: other, candidateHash: 'candidate-hash' },
  riskApplicationEnabled: false, detailsStatus: 'unavailable', detailsErrorCode: 'ADOPTION_DETAILS_UNAVAILABLE' };
let root: Root, host: HTMLDivElement, client: QueryClient;
let mode: 'recover' | 'offline' | 'rejected';
let requests: Array<{ method: string; body: unknown; path: string }>;
const flush = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); });
const button = (label: string) => [...host.querySelectorAll<HTMLElement>('[role="button"],[role="radio"],button')].find(node => node.textContent === label)!;
async function click(label: string) { await act(async () => button(label).click()); await flush(); }
async function mount() {
  await act(async () => root.render(<QueryClientProvider client={client}><OptimizationAdoptionScreen /></QueryClientProvider>));
  await flush();
  await vi.waitFor(async () => { await flush(); expect(host.textContent).toContain('已核对定义、差异与测试结果揭示'); });
  await click('已核对定义、差异与测试结果揭示');
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  runtime.store.clear(); runtime.failCleanup = false; runtime.navigate.mockReset(); runtime.route = { id, candidateId: other };
  mode = 'recover'; requests = [];
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const api = new ThesisLedgerApiClient('https://fixture.test/api/v1', (input, init) => {
    const url = new URL(String(input));
    requests.push({ method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : null, path: url.pathname });
    if (url.pathname.endsWith('/compare')) return Promise.resolve(Response.json(compare));
    if (url.pathname.endsWith('/adopt-context')) return Promise.resolve(Response.json(context));
    if (url.pathname.endsWith('/adopt')) {
      if (mode === 'rejected') return Promise.resolve(Response.json({ error: 'ADOPTION_STALE_BASELINE', errorCode: 'ADOPTION_STALE_BASELINE', message: '版本已变化' }, { status: 409 }));
      return Promise.reject(new TypeError('network lost'));
    }
    if (url.pathname.endsWith('/adoption')) {
      if (mode === 'offline') return Promise.reject(new TypeError('network lost'));
      return Promise.resolve(Response.json(mode === 'rejected' ? null : receipt));
    }
    return Promise.reject(new Error('未配置请求 ' + url.pathname));
  });
  runtime.value = { api, scope: ['adoption-test', 'actual'], baseUrl: 'https://fixture.test/api/v1', theme: getMobileTheme('light') };
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); client.clear(); host.remove(); vi.unstubAllGlobals(); });

describe('Mobile 采纳响应恢复', () => {
  it('响应中断后自动只读找回正式版本，附加预览不可用也显示成功', async () => {
    await mount(); await click('确认采用候选');
    expect(host.textContent).toContain('正式版本 v2 已保存');
    expect(host.textContent).toContain('风险规则预览暂不可用');
    expect(button('打开采用后的正式版本')).toBeTruthy();
    expect(runtime.store.size).toBe(0);
    expect(requests.filter(r => r.method === 'POST')).toHaveLength(1);
    expect(requests.some(r => r.method === 'GET' && r.path.endsWith('/adoption'))).toBe(true);
    await click('打开采用后的正式版本');
    expect(runtime.navigate).toHaveBeenCalledWith('StrategyVersion', { strategyId: id, versionId: other });
  });
  it('重查失败保留原凭据与待确认提示，显式找回仍复用原请求体', async () => {
    mode = 'offline'; await mount(); await click('确认采用候选');
    expect(host.textContent).toContain('采纳结果暂未确认');
    expect(runtime.store.size).toBe(1);
    const original = requests.find(r => r.method === 'POST')!.body;
    expect(requests.filter(r => r.method === 'POST')).toHaveLength(1);
    mode = 'recover'; await click('找回原候选采用');
    expect(requests.filter(r => r.method === 'POST').map(r => r.body)).toEqual([original, original]);
    expect(host.textContent).toContain('正式版本 v2 已保存');
  });
  it('本地清理失败不将已确认采纳改为失败，原凭据仍保留', async () => {
    runtime.failCleanup = true; await mount(); await click('确认采用候选');
    expect(host.textContent).toContain('正式版本 v2 已保存');
    expect(button('打开采用后的正式版本')).toBeTruthy();
    expect(runtime.store.size).toBe(1);
  });
  it('明确版本冲突可重新审核，自动核对不重复写入', async () => {
    mode = 'rejected'; await mount(); await click('确认采用候选');
    expect(host.textContent).toContain('版本已变化');
    expect(button('重新审核被拒绝的采用请求')).toBeTruthy();
    await click('重新审核被拒绝的采用请求');
    expect(runtime.store.size).toBe(0);
    expect(requests.filter(r => r.method === 'POST')).toHaveLength(1);
  });
});
