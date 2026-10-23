// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfirmDialogProvider } from '../src/components/ui/confirm-dialog.js';
import { NavigationGuardProvider } from '../src/features/shared/navigation-guard.js';
import {
  PortfolioModeProvider,
  usePortfolioMode,
} from '../src/features/portfolio/portfolio-mode-context.js';
import { NewResearchSheet } from '../src/features/ai/NewResearchSheet.js';
import { researchContextForScope } from '../src/features/ai/research-account-scope.js';
import type { AiResearchRetryPrefill } from '../src/features/ai/ai.types.js';

const api = vi.hoisted(() => ({
  accounts: vi.fn(),
  valuation: vi.fn(),
  create: vi.fn(),
  toast: { add: vi.fn() },
  prefill: undefined as AiResearchRetryPrefill | undefined,
}));
vi.mock('../src/components/ui/toast', () => ({ useToastManager: () => api.toast }));
vi.mock('../src/features/portfolio/portfolio.api', async (original) => ({
  ...(await original<object>()),
  fetchAccounts: api.accounts,
  fetchPortfolioValuation: api.valuation,
}));
vi.mock('../src/features/ai/ai.mutations', () => ({
  useCreateAiRunMutation: () => ({ isPending: false, mutateAsync: api.create }),
}));
vi.mock('../src/features/ai/ai.queries', () => ({
  useAiCapabilitiesQuery: () => ({
    data: { canStart: true, providers: [] },
    isPending: false,
    isError: false,
  }),
  useAiRoutingSettingsQuery: () => ({
    data: { revision: '1', researchDefault: { providerId: 'test', model: 'test' } },
    isPending: false,
    isError: false,
  }),
  useAiResearchRetryPrefillQuery: () => ({ data: api.prefill, isPending: false, isError: false }),
}));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const accounts = [
  { id: 'A', name: '实际账户', mode: 'actual', type: 'securities', currency: 'CNY' },
  { id: 'B', name: '模拟账户', mode: 'shadow', type: 'securities', currency: 'CNY' },
];
let host: HTMLDivElement;
let root: Root;
let client: QueryClient;
let router: ReturnType<typeof createMemoryRouter>;
let requestMode: () => Promise<boolean>;
function Form() {
  const { mode, changeMode } = usePortfolioMode();
  const [open, setOpen] = useState(true);
  requestMode = () => changeMode(mode === 'actual' ? 'shadow' : 'actual');
  return (
    <>
      <output>{mode}</output>
      <button onClick={() => setOpen(true)}>打开研究表单</button>
      <NewResearchSheet
        open={open}
        onOpenChange={setOpen}
        onCreated={vi.fn()}
        {...(api.prefill ? { retryOfRunId: api.prefill.sourceRunId } : {})}
      />
    </>
  );
}
async function mount(mode = 'shadow') {
  window.localStorage.setItem('thesis-ledger-portfolio-mode', mode);
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  const element = (
    <QueryClientProvider client={client}>
      <ConfirmDialogProvider>
        <NavigationGuardProvider>
          <PortfolioModeProvider>
            <Form />
          </PortfolioModeProvider>
        </NavigationGuardProvider>
      </ConfirmDialogProvider>
    </QueryClientProvider>
  );
  router = createMemoryRouter([{ path: '*', element }]);
  await act(async () => root.render(<RouterProvider router={router} />));
}
async function click(element: Element) {
  await act(async () => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}
async function button(name: string) {
  const element = [...document.querySelectorAll('button')].find(
    (e) => e.textContent?.trim() === name,
  );
  expect(element, name).toBeDefined();
  await click(element!);
}
async function wait(check: () => void) {
  await vi.waitFor(async () => {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    check();
  });
}
function accountOptions(triggerId: string) {
  const controls = document.getElementById(triggerId)?.getAttribute('aria-controls');
  return controls ? [...(document.getElementById(controls)?.querySelectorAll('[role="option"]') ?? [])] : [];
}
const NativeRequest = globalThis.Request;
beforeEach(() => {
  vi.clearAllMocks();
  api.prefill = undefined;
  window.localStorage.clear();
  vi.stubGlobal(
    'Request',
    class extends NativeRequest {
      constructor(input: RequestInfo | URL, init?: RequestInit) {
        super(input, init ? { ...init, signal: undefined } : undefined);
      }
    },
  );
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
  api.accounts.mockResolvedValue(accounts);
  api.valuation.mockResolvedValue({
    positions: [{ symbol: 'SHADOW', asset: { name: '模拟持仓' } }],
  });
});
afterEach(async () => {
  await act(async () => root.unmount());
  router.dispose();
  client.clear();
  host.remove();
  vi.unstubAllGlobals();
});

describe('研究草稿的应用账户模式', () => {
  it('模拟账户/持仓选择只消费模拟数据，零生成调用', async () => {
    await mount();
    await button('账户');
    await click(document.querySelector('#ai-account')!);
    await wait(() => expect(accountOptions('ai-account')).toHaveLength(1));
    expect(accountOptions('ai-account')[0]?.textContent).toContain('模拟账户');
    await click(accountOptions('ai-account')[0]!);
    await button('单个持仓');
    await click(document.querySelector('#ai-position-account')!);
    await wait(() => expect(accountOptions('ai-position-account')).toHaveLength(1));
    await click(accountOptions('ai-position-account')[0]!);
    await wait(() => expect(api.valuation).toHaveBeenCalledWith('shadow', 'B', undefined));
    expect(api.create).not.toHaveBeenCalled();
  });
  it('研究问题取消切换完整保留，确认后关闭旧草稿，新表单继承新模式', async () => {
    await mount();
    const input = document.querySelector<HTMLTextAreaElement>('#ai-question')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
        input,
        '模拟研究问题',
      );
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      void requestMode();
    });
    await button('继续编辑');
    expect(input.value).toBe('模拟研究问题');
    expect(host.querySelector('output')?.textContent).toBe('shadow');
    await act(async () => {
      void requestMode();
    });
    await button('放弃修改并切换');
    await wait(() => expect(document.querySelector('#ai-question')).toBeNull());
    await button('打开研究表单');
    await wait(() => expect(document.querySelector('#ai-question')).not.toBeNull());
    expect((document.querySelector('#ai-question') as HTMLTextAreaElement).value).toBe('');
    expect(document.body.textContent).toContain('当前为实际账户范围');
    expect(api.create).not.toHaveBeenCalled();
  });
  it('跨模式重试说明原归属并禁用提交，不重写原 context', async () => {
    api.prefill = {
      sourceRunId: 'source',
      context: { scope: 'portfolio', mode: 'actual' },
      question: '原问题',
      templateId: null,
      sourceOutcome: 'failed',
      contextState: 'valid',
      requiresUnknownOutcomeAcknowledgement: false,
    };
    const original = JSON.stringify(api.prefill);
    await mount();
    await wait(() => expect(document.body.textContent).toContain('原任务属于另一模式'));
    const submit = [...document.querySelectorAll('button')].find(
      (e) => e.textContent === '确认并再次生成',
    )!;
    expect(submit.disabled).toBe(true);
    expect(JSON.stringify(api.prefill)).toBe(original);
    expect(api.create).not.toHaveBeenCalled();
  });
  it('新建上下文固定模式，策略对象独立且不夹带账户模式', async () => {
    await mount();
    expect(
      researchContextForScope({
        scope: 'portfolio',
        mode: 'shadow',
        accountId: null,
        symbol: null,
        strategyVersionId: null,
      }),
    ).toEqual({ scope: 'portfolio', mode: 'shadow' });
    expect(
      researchContextForScope({
        scope: 'position',
        mode: 'shadow',
        accountId: 'B',
        symbol: 'SHADOW',
        strategyVersionId: null,
      }),
    ).toEqual({ scope: 'position', mode: 'shadow', accountId: 'B', symbol: 'SHADOW' });
    expect(
      researchContextForScope({
        scope: 'strategy',
        mode: 'shadow',
        accountId: 'B',
        symbol: 'SHADOW',
        strategyVersionId: 'V',
      }),
    ).toEqual({ scope: 'strategy', strategyVersionId: 'V' });
  });
});
