import { useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router';
import { desktopPathForView, type DesktopNavigationView } from '../views.js';
import { usePortfolioShellQueries } from '../features/portfolio/portfolio.queries.js';
import type { PortfolioMode } from '../features/portfolio/portfolio.types.js';
import {
  AiChat,
  ImportReview,
  JournalDashboard,
  LegacyImportReviewRedirect,
  PerformanceDashboard,
  PortfolioDashboard,
  PortfolioManagement,
  ProviderSettings,
  RiskCenter,
  StrategyDashboard,
} from '../features/legacy-pages.js';
import { MarketDataPage } from '../features/market-data/MarketDataPage.js';

type ImportStep = 'account' | 'position' | 'screenshot';
type NavigationOptions = { step?: ImportStep };

export function AppRoutes() {
  const location = useLocation();
  const navigate = useNavigate();
  const [portfolioMode, setPortfolioMode] = useState<PortfolioMode>('actual');
  const { state, portfolio, accounts, accountsReady, refresh } = usePortfolioShellQueries(portfolioMode);

  const navigateTo = (nextView: DesktopNavigationView, options?: NavigationOptions) => {
    if (nextView === 'position-entry' && options?.step === 'account') {
      void navigate('/accounts');
      return;
    }
    const path = desktopPathForView(nextView);
    if (!path) return;
    const params = new URLSearchParams(location.search);
    if (nextView === 'position-entry' && options?.step) params.set('step', options.step);
    if (nextView !== 'position-entry') {
      params.delete('step');
      params.delete('accountId');
    }
    const search = params.toString();
    void navigate({ pathname: path, ...(search ? { search: `?${search}` } : {}) });
  };

  return (
    <Routes>
      <Route path="/" element={<Navigate to="/portfolio" replace />} />
      <Route
        path="/portfolio"
        element={
          <PortfolioDashboard
            state={state}
            portfolio={portfolio}
            accounts={accounts}
            mode={portfolioMode}
            onModeChange={setPortfolioMode}
            onRetry={() => void refresh()}
            onNavigate={navigateTo}
          />
        }
      />
      <Route path="/import-review" element={<LegacyImportReviewRedirect />} />
      <Route
        path="/position-entry"
        element={
          <ImportReview
            accounts={accounts}
            positions={portfolio?.positions ?? []}
            cashValue={portfolio?.cashValue ?? 0}
            accountsReady={accountsReady}
            onPortfolioChanged={() => void refresh()}
          />
        }
      />
      <Route
        path="/accounts"
        element={
          <PortfolioManagement
            accounts={accounts}
            positions={[]}
            step="account"
            accountsReady={accountsReady}
            onAccountEntry={(accountId) => {
              const params = new URLSearchParams({ accountId, method: 'manual', step: 'position' });
              void navigate({ pathname: '/position-entry', search: `?${params.toString()}` });
            }}
            onSaved={() => void refresh()}
          />
        }
      />
      <Route path="/risk-center" element={<RiskCenter accounts={accounts} portfolio={portfolio} />} />
      <Route path="/performance" element={<PerformanceDashboard accounts={accounts} />} />
      <Route path="/strategy" element={<StrategyDashboard />} />
      <Route path="/journal" element={<JournalDashboard />} />
      <Route path="/ai-chat" element={<AiChat />} />
      <Route path="/providers" element={<ProviderSettings />} />
      <Route path="/market-data" element={<MarketDataPage />} />
      <Route path="*" element={<Navigate to="/portfolio" replace />} />
    </Routes>
  );
}
