import { useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../src/components/ui/toast.js';
import { ConfirmDialogProvider } from '../src/components/ui/confirm-dialog.js';
import { Button } from '../src/components/ui/button.js';
import { NavigationGuardProvider } from '../src/features/shared/navigation-guard.js';
import {
  PortfolioModeProvider,
  usePortfolioMode,
} from '../src/features/portfolio/portfolio-mode-context.js';
import { AiChat } from '../src/features/ai/AiChat.js';
import { setIdentitySession } from '../src/shared/api/identity-session.js';
import {
  createResearchBrowserApi,
  type ResearchBrowserScenario,
  type ResearchBrowserExamples,
} from './research-workbench-browser-data.js';
import '../src/ui/styles.css';

const requested = new URLSearchParams(window.location.search).get('case');
const cases: ResearchBrowserScenario[] = [
  'normal',
  'lost',
  'hold',
  'closed',
  'queued',
  'registered',
];
const scenario = cases.includes(requested as ResearchBrowserScenario)
  ? (requested as ResearchBrowserScenario)
  : 'normal';
sessionStorage.clear();
localStorage.setItem('thesis-ledger-portfolio-mode', 'shadow');
if (scenario === 'registered')
  setIdentitySession({
    token: 'r'.repeat(43),
    expiresAt: '2030-01-01T00:00:00Z',
    principal: {
      id: 'f1111111-ffff-4fff-8fff-ffffffffffff',
      username: 'browser-reader',
      displayName: '受控注册身份',
    },
  });
const sampleUrl = new URL(
  '../../../packages/schemas/fixtures/research-v2.samples.json',
  import.meta.url,
);
const sample = (await fetch(sampleUrl).then((response) =>
  response.json(),
)) as ResearchBrowserExamples;
const controlled = createResearchBrowserApi(scenario, sample);
window.fetch = controlled.fetcher;
function Frame() {
  const stats = useSyncExternalStore(controlled.subscribe, controlled.stats);
  const { mode, changeMode, busy } = usePortfolioMode();
  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-4 bg-background p-6 text-foreground">
      <header className="flex flex-col gap-2 border-b pb-4">
        <h1 className="text-xl font-semibold">研究工作台受控交互验收</h1>
        <p className="text-sm text-muted-foreground">
          仅合成序列化响应，所有请求由本页内存处理；不访问业务库、真实来源或模型。场景：{scenario}
        </p>
        <div className="flex items-center gap-2">
          <span>{mode === 'shadow' ? '模拟模式' : '实际模式'}</span>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => void changeMode(mode === 'shadow' ? 'actual' : 'shadow')}
          >
            切换应用全局模式
          </Button>
        </div>
        <output aria-label="受控请求统计" className="break-all font-mono text-xs">
          {stats}
        </output>
      </header>
      <AiChat />
    </main>
  );
}
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const router = createMemoryRouter(
  [
    {
      path: '*',
      element: (
        <QueryClientProvider client={client}>
          <ToastProvider>
            <ConfirmDialogProvider>
              <NavigationGuardProvider>
                <PortfolioModeProvider>
                  <Frame />
                </PortfolioModeProvider>
              </NavigationGuardProvider>
            </ConfirmDialogProvider>
          </ToastProvider>
        </QueryClientProvider>
      ),
    },
  ],
  { initialEntries: ['/ai-chat'] },
);
createRoot(document.getElementById('root')!).render(<RouterProvider router={router} />);
