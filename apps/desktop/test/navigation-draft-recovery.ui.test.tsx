// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createMemoryRouter, Outlet, RouterProvider, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  NavigationGuardProvider,
  useNavigationGuard,
} from '../src/features/shared/navigation-guard.js';
import { useMarketPolicyWorkflow } from '../src/features/market-data/useMarketPolicyWorkflow.js';
import { StrategyCenterLayout } from '../src/features/strategy/StrategyCenterLayout.js';
import { strategyCenterTabForPath } from '../src/features/strategy/strategy-center.navigation.js';
import { policy } from './market-policy-defaults.fixture.js';

const api = vi.hoisted(() => ({
  confirm: vi.fn(),
  toast: vi.fn(),
  save: vi.fn(),
  retry: vi.fn(),
  busy: false,
}));
const NativeRequest = globalThis.Request;
vi.mock('../src/components/ui/confirm-dialog', () => ({
  useConfirmDialog: () => ({ confirm: api.confirm }),
}));
vi.mock('../src/components/ui/toast', () => ({ useToastManager: () => ({ add: api.toast }) }));
vi.mock('../src/features/market-data/market-data.mutations.js', () => ({
  useSaveMarketPolicyMutation: () => ({ mutateAsync: api.save, isPending: api.busy }),
  useRetryMarketPolicyMutation: () => ({ mutateAsync: api.retry, isPending: false }),
}));
let root: Root, host: HTMLDivElement, router: ReturnType<typeof createMemoryRouter>;
let workflow: ReturnType<typeof useMarketPolicyWorkflow>;
function PolicyPage() {
  workflow = useMarketPolicyWorkflow({
    policy,
    catalogComplete: true,
    catalog: undefined,
    providers: [],
    setBusyAction: () => undefined,
    setMessage: () => undefined,
  });
  return <p>市场路由</p>;
}
function StrategyPage() {
  const { pathname } = useLocation();
  useNavigationGuard({ dirty: pathname.endsWith('/new'), busy: false });
  return (
    <StrategyCenterLayout value={strategyCenterTabForPath(pathname)}>
      <p>{pathname}</p>
    </StrategyCenterLayout>
  );
}
async function mount(strategy = false) {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  router = createMemoryRouter(
    [
      {
        element: (
          <NavigationGuardProvider>
            <Outlet />
          </NavigationGuardProvider>
        ),
        children: [
          { path: '/market-data', element: <PolicyPage /> },
          { path: '/other', element: <p>其他页面</p> },
          { path: '/strategy/*', element: <StrategyPage /> },
        ],
      },
    ],
    {
      initialEntries: strategy
        ? ['/strategy/jobs', '/strategy/experiments/new']
        : ['/other', '/market-data'],
    },
  );
  await act(async () => root.render(<RouterProvider router={router} />));
}
async function navigate(to: string | number) {
  await act(async () => {
    if (typeof to === 'number') await router.navigate(to);
    else await router.navigate(to);
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  api.busy = false;
  api.confirm.mockResolvedValue(false);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal(
    'Request',
    class extends NativeRequest {
      constructor(input: RequestInfo | URL, init?: RequestInit) {
        super(input, init ? { ...init, signal: undefined } : undefined);
      }
    },
  );
});
afterEach(async () => {
  await act(async () => root?.unmount());
  router?.dispose();
  host?.remove();
  vi.unstubAllGlobals();
});

describe('路由与草稿恢复', () => {
  it('路由保存失败后拒绝离开仍保留草稿，确认放弃后重开使用服务端值', async () => {
    await mount();
    await act(async () => workflow.changeDraft({ ...workflow.draft!, enabled: !policy.enabled }));
    api.save.mockRejectedValue(new Error('503'));
    await act(async () => workflow.save());
    await navigate('/other');
    expect(router.state.location.pathname).toBe('/market-data');
    expect(workflow.dirty).toBe(true);
    expect(workflow.draft?.enabled).toBe(!policy.enabled);
    api.confirm.mockResolvedValue(true);
    await navigate('/other');
    await navigate('/market-data');
    expect(workflow.draft?.enabled).toBe(policy.enabled);
    expect(workflow.dirty).toBe(false);
    expect(api.save).toHaveBeenCalledTimes(1);
  });
  it('历史后退也受保护，确认后前进不恢复放弃的草稿', async () => {
    await mount();
    await act(async () => workflow.changeDraft({ ...workflow.draft!, enabled: !policy.enabled }));
    await navigate(-1);
    expect(router.state.location.pathname).toBe('/market-data');
    api.confirm.mockResolvedValue(true);
    await navigate(-1);
    expect(router.state.location.pathname).toBe('/other');
    await navigate(1);
    expect(workflow.draft?.enabled).toBe(policy.enabled);
  });
  it('策略导航被拦截时选中 Tab 保持在实际路由，确认后才改变', async () => {
    await mount(true);
    const jobs = [...host.querySelectorAll<HTMLAnchorElement>('[role="tab"]')].find(
      (x) => x.textContent === '回测任务',
    )!;
    await act(async () => jobs.click());
    expect(router.state.location.pathname).toBe('/strategy/experiments/new');
    expect(host.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe('AI 实验');
    api.confirm.mockResolvedValue(true);
    await act(async () => jobs.click());
    expect(router.state.location.pathname).toBe('/strategy/jobs');
    expect(host.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe('回测任务');
  });
});
