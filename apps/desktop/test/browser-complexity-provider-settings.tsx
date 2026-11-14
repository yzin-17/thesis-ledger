import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { ConfirmDialogProvider } from '../src/components/ui/confirm-dialog.js';
import { ToastProvider } from '../src/components/ui/toast.js';
import { ProviderSettings } from '../src/features/providers/ProviderSettings.js';
import { providerKeys } from '../src/features/providers/providers.queries.js';
import { aiProvider } from './ai-provider-fixture.js';
import '../src/ui/styles.css';

const client = new QueryClient({
  defaultOptions: {
    queries: {
      enabled: false,
      retry: false,
      staleTime: Infinity,
    },
  },
});
const page = { items: [], page: 1, pageSize: 20, total: 0, totalPages: 0 };
client.setQueryData(providerKeys.providers(), [
  aiProvider({
    name: '受控连接',
    baseUrl: 'https://example.invalid/v1',
    enabled: false,
    models: ['controlled-model'],
    modelReasoning: {},
  }),
]);
client.setQueryData(providerKeys.issues(), []);
client.setQueryData(providerKeys.jobs(), []);
client.setQueryData(providerKeys.healthHistory(1), page);
client.setQueryData(providerKeys.jobHistory(1), page);
client.setQueryData(providerKeys.notificationFailures(), []);
client.setQueryData(providerKeys.healthFailures(1), page);
client.setQueryData(providerKeys.automationFailures(1), page);

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={client}>
    <MemoryRouter>
      <ToastProvider>
        <ConfirmDialogProvider>
          <main className="mx-auto max-w-6xl p-4">
            <ProviderSettings />
          </main>
        </ConfirmDialogProvider>
      </ToastProvider>
    </MemoryRouter>
  </QueryClientProvider>,
);
