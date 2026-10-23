import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { ConfirmDialogProvider } from '../components/ui/confirm-dialog.js';
import { Toaster } from '../components/ui/toast.js';
import { ThemeProvider } from '../ui/theme.js';
import { MarketColorProvider } from '../ui/market-color.js';
import { AppShell } from './AppShell.js';
import { AppRoutes } from './routes.js';
import { NavigationGuardProvider } from '../features/shared/navigation-guard.js';
import { PortfolioModeProvider } from '../features/portfolio/portfolio-mode-context.js';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { refetchOnWindowFocus: false, retry: false },
  },
});

function AppContent() {
  return (
    <ThemeProvider>
      <MarketColorProvider>
        <Toaster>
          <ConfirmDialogProvider>
            <NavigationGuardProvider>
              <PortfolioModeProvider>
                <AppShell>
                  <AppRoutes />
                </AppShell>
              </PortfolioModeProvider>
            </NavigationGuardProvider>
          </ConfirmDialogProvider>
        </Toaster>
      </MarketColorProvider>
    </ThemeProvider>
  );
}

export const appRouter = createBrowserRouter([{ path: '*', element: <AppContent /> }]);

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={appRouter} />
    </QueryClientProvider>
  );
}
