import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router';
import { ConfirmDialogProvider } from '../components/ui/confirm-dialog.js';
import { Toaster } from '../components/ui/toast.js';
import { ThemeProvider } from '../ui/theme.js';
import { MarketColorProvider } from '../ui/market-color.js';
import { AppShell } from './AppShell.js';
import { AppRoutes } from './routes.js';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { refetchOnWindowFocus: false, retry: false },
  },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ThemeProvider>
          <MarketColorProvider>
            <Toaster>
              <ConfirmDialogProvider>
                <AppShell>
                  <AppRoutes />
                </AppShell>
              </ConfirmDialogProvider>
            </Toaster>
          </MarketColorProvider>
        </ThemeProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
