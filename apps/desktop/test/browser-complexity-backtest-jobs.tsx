import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Route, Routes, useLocation, useNavigate } from 'react-router';
import { Button } from '../src/components/ui/button.js';
import { StrategyBacktestJobsPage } from '../src/features/strategy/StrategyBacktestJobsPage.js';
import '../src/ui/styles.css';

const client = new QueryClient({
  defaultOptions: { queries: { enabled: false, retry: false, staleTime: Infinity } },
});
const job = {
  id: 'controlled-job',
  strategyVersionId: 'controlled-version',
  status: 'succeeded',
  createdAt: '2026-11-12T01:00:00Z',
  startDate: '2025-01-01',
  endDate: '2025-12-31',
};
const items = [
  { id: 'controlled-user', kind: 'user', name: '受控用户任务', jobs: [job], members: [] },
  {
    id: 'controlled-experiment',
    kind: 'experiment',
    name: '受控实验任务',
    experimentId: 'controlled-experiment',
    jobs: [{ ...job, id: 'controlled-candidate' }],
    members: [],
  },
];
for (const search of ['', '受控']) {
  for (const status of ['', 'succeeded']) {
    for (const cursor of ['', 'page-2']) {
      const filters = {
        limit: 30,
        ...(search ? { search } : {}),
        ...(status ? { status } : {}),
        ...(cursor ? { cursor } : {}),
      };
      client.setQueryData(['desktop', 'strategy', 'backtest-groups', filters], {
        items,
        totalCount: 3,
        pageInfo: { hasNextPage: !cursor, nextCursor: cursor ? null : 'page-2' },
      });
    }
  }
}

function ControlledDetail() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as { backtestJobsSearch?: string } | null;
  return (
    <Button onClick={() => navigate('/strategy/jobs?' + (state?.backtestJobsSearch ?? ''))}>
      返回回测任务
    </Button>
  );
}

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={client}>
    <BrowserRouter>
      <main className="mx-auto max-w-6xl p-4">
        <Routes>
          <Route path="/strategy/jobs" element={<StrategyBacktestJobsPage strategies={[]} />} />
          <Route path="/strategy/jobs/:id" element={<ControlledDetail />} />
          <Route path="*" element={<StrategyBacktestJobsPage strategies={[]} />} />
        </Routes>
      </main>
    </BrowserRouter>
  </QueryClientProvider>,
);
