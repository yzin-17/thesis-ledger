import { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider, useLocation, useNavigate } from 'react-router';
import { Button } from '../src/components/ui/button';
import { ConfirmDialogProvider } from '../src/components/ui/confirm-dialog';
import { Toaster } from '../src/components/ui/toast';
import {
  NavigationGuardProvider,
  useGuardedTransition,
} from '../src/features/shared/navigation-guard';
import {
  PortfolioModeProvider,
  usePortfolioMode,
} from '../src/features/portfolio/portfolio-mode-context';
import { PortfolioManagement } from '../src/features/portfolio/PortfolioManagement';
import { StrategyEditorSheet } from '../src/features/strategy/StrategyEditorSheet';
import { createDefaultStrategySchema } from '../src/features/strategy/strategy.schema';
import '../src/ui/styles.css';

declare global {
  interface Window {
    navigationDraftHarness?: {
      refresh: (value: string) => void;
      leave: () => void;
      ready: () => boolean;
    };
  }
}

const scenario = new URLSearchParams(window.location.search).get('case') ?? 'mode';
const schema = createDefaultStrategySchema('受控策略');
const strategy = {
  id: 'controlled-strategy',
  name: '受控策略',
  versions: [{ id: 'controlled-version', version: 1, schema }],
};
const account = {
  id: 'controlled-account',
  name: '受控账户',
  type: 'securities' as const,
  mode: 'actual' as const,
  currency: 'CNY' as const,
};
const position = {
  id: 'controlled-position',
  accountId: account.id,
  symbol: '510300.SH',
  quantity: 200,
  costPrice: 4,
  marketValue: 800,
  pnl: 0,
  asset: { name: '受控 ETF', assetType: 'etf' as const },
};
const forbidSave = () => {
  throw new Error('受控验收不得提交业务数据');
};

function Screen() {
  const { mode, changeMode } = usePortfolioMode();
  const location = useLocation();
  const navigate = useNavigate();
  const guard = useGuardedTransition();
  useEffect(() => {
    window.navigationDraftHarness = {
      ready: () =>
        !guard?.checking &&
        [...router.state.blockers.values()].every((blocker) => blocker.state === 'unblocked'),
      leave: () => {
        void navigate('/away');
      },
      refresh: (value) => {
        const field = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(
          scenario === 'position' ? 'input[aria-label="当前数量"]' : '#strategy-description',
        );
        if (!field) throw new Error('未找到受控字段');
        const prototype =
          field instanceof HTMLTextAreaElement
            ? HTMLTextAreaElement.prototype
            : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(field, value);
        field.dispatchEvent(new Event('input', { bubbles: true }));
        field.dispatchEvent(new Event('change', { bubbles: true }));
      },
    };
    return () => {
      delete window.navigationDraftHarness;
    };
  }, [navigate, guard?.checking]);
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
      <h1 className="text-xl font-semibold">导航草稿快照验收</h1>
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <output data-testid="mode">{mode}</output>
        <output data-testid="path">{location.pathname}</output>
        <Button onClick={() => void changeMode('shadow')}>切换到模拟</Button>
        <Button variant="outline" onClick={() => void navigate('/away')}>
          离开编辑器
        </Button>
      </div>
      {location.pathname === '/away' ? (
        <p className="text-sm">已离开编辑器</p>
      ) : (
        <div key={mode}>
          {scenario === 'position' ? (
            <PortfolioManagement
              accounts={[account]}
              positions={[position]}
              step="position"
              showCash={false}
              calibrationMode
              onSaved={forbidSave}
            />
          ) : (
            <StrategyEditorSheet
              open
              mode="edit"
              presentation="page"
              strategy={strategy}
              version={strategy.versions[0]!}
              busy={false}
              onOpenChange={() => undefined}
              onSave={forbidSave}
            />
          )}
        </div>
      )}
    </main>
  );
}

const client = new QueryClient({
  defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
});
const router = createMemoryRouter(
  [
    {
      path: '*',
      element: (
        <NavigationGuardProvider>
          <PortfolioModeProvider>
            <Screen />
          </PortfolioModeProvider>
        </NavigationGuardProvider>
      ),
    },
  ],
  { initialEntries: ['/editor'] },
);
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={client}>
    <Toaster>
      <ConfirmDialogProvider>
        <RouterProvider router={router} />
      </ConfirmDialogProvider>
    </Toaster>
  </QueryClientProvider>,
);
