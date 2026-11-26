import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { diagnosticsClient } from '@thesis-ledger/api-client';
import { HealthHistoryTable } from '../src/features/providers/ProviderSettingsSections';
import '../src/ui/styles.css';

const client = diagnosticsClient(async (path, schema) => {
  const response = await fetch(`/api${path}`);
  if (!response.ok) throw new Error('受控健康历史请求失败');
  const result = schema.safeParse(await response.json());
  if (!result.success) throw new Error('受控健康历史格式无效');
  return result.data;
});
function History() {
  const [page, setPage] = useState(1);
  const query = useQuery({ queryKey: ['health-history-regression', page], queryFn: () => client.healthHistory(page), retry: false });
  let loadState: 'loading' | 'ready' | 'error' = 'loading';
  if (query.isError) loadState = 'error';
  else if (query.data) loadState = 'ready';
  return <main className="module-page p-4"><HealthHistoryTable
    history={query.data ?? { page, pageSize: 20, items: [], total: 0, totalPages: 0 }}
    loading={query.isFetching} loadState={loadState}
    onPage={setPage} onRetry={() => { void query.refetch(); }} />
  </main>;
}
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={new QueryClient()}><History /></QueryClientProvider>,
);
