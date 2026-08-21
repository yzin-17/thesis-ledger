import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router';
import { Toaster } from '../components/ui/toast.js';
import { ThemeProvider } from '../ui/theme.js';
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
          <Toaster>
            <AppShell>
              <AppRoutes />
            </AppShell>
          </Toaster>
        </ThemeProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
