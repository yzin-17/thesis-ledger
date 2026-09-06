import { useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router';
import { desktopPathForView, type DesktopNavigationView } from '../views.js';
import { usePortfolioShellQueries } from '../features/portfolio/portfolio.queries.js';
import type { PortfolioMode } from '../features/portfolio/portfolio.types.js';
import { AccountDataPage } from '../features/account-data/AccountDataPage.js';
import { AiChat } from '../features/ai/AiChat.js';
import { LegacyImportReviewRedirect } from '../features/import/LegacyImportReviewRedirect.js';
import { JournalDashboard } from '../features/journal/JournalDashboard.js';
import { PerformanceDashboard } from '../features/performance/PerformanceDashboard.js';
import { PortfolioDashboard } from '../features/portfolio/PortfolioDashboard.js';
import { ProviderSettings } from '../features/providers/ProviderSettings.js';
import { RiskCenter } from '../features/risk/RiskCenter.js';
import { StrategyDashboard } from '../features/strategy/StrategyDashboard.js';
import { MarketDataPage } from '../features/market-data/MarketDataPage.js';
import type { PortfolioTradeReviewTarget } from '../features/portfolio/PortfolioTradeDetailSheet.js';

type ImportStep = 'account' | 'position' | 'screenshot';
type NavigationOptions = { step?: ImportStep };

export function AppRoutes() {
  const location = useLocation();
  const navigate = useNavigate();
  const [portfolioMode, setPortfolioMode] = useState<PortfolioMode>('actual');
  const { state, portfolio, accounts, accountsReady, accountsPending, accountsError, refreshing, refresh } =
    usePortfolioShellQueries(portfolioMode);

  const navigateTo = (nextView: DesktopNavigationView, options?: NavigationOptions) => {
    const path = desktopPathForView(nextView);
    if (!path) return;
    const params = new URLSearchParams(location.search);
    if (nextView === 'position-entry' && options?.step === 'account') {
      params.set('setup', '1');
      params.delete('tab');
      params.delete('entry');
    } else if (nextView === 'position-entry' && options?.step === 'position') {
      params.set('tab', 'positions');
      params.delete('setup');
      params.delete('entry');
    } else if (nextView === 'position-entry' && options?.step === 'screenshot') {
      params.set('tab', 'positions');
      params.set('entry', 'screenshot');
      params.delete('setup');
    }
    if (nextView !== 'position-entry') {
      params.delete('step');
      params.delete('accountId');
      params.delete('entry');
      params.delete('setup');
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
            refreshing={refreshing}
            onNavigate={navigateTo}
            onOpenReview={(target: PortfolioTradeReviewTarget) => {
              const params = new URLSearchParams({
                accountId: target.accountId,
                tradeId: target.tradeId,
                reviewObjectType: target.reviewObjectType,
                mode: portfolioMode,
                ...(target.closeSliceId ? { closeSliceId: target.closeSliceId } : {}),
              });
              void navigate({ pathname: '/journal', search: `?${params.toString()}` });
            }}
          />
        }
      />
      <Route path="/import-review" element={<LegacyImportReviewRedirect />} />
      <Route path="/position-entry" element={<LegacyImportReviewRedirect />} />
      <Route
        path="/accounts"
        element={
          <AccountDataPage
            accounts={accounts}
            accountsReady={accountsReady}
            accountsPending={accountsPending}
            accountsError={accountsError}
            onRetryAccounts={() => void refresh()}
            onPortfolioChanged={() => void refresh()}
          />
        }
      />
      <Route
        path="/risk-center"
        element={
          <RiskCenter
            accounts={accounts}
            portfolio={portfolio}
            portfolioState={state}
            mode={portfolioMode}
            onModeChange={setPortfolioMode}
          />
        }
      />
      <Route
        path="/performance"
        element={
          <PerformanceDashboard
            accounts={accounts}
            mode={portfolioMode}
            onModeChange={setPortfolioMode}
            onNavigate={navigateTo}
          />
        }
      />
      <Route path="/strategy" element={<StrategyDashboard />} />
      <Route
        path="/journal"
        element={
          <JournalDashboard
            accounts={accounts}
            accountsReady={accountsReady}
            accountsPending={accountsPending}
            accountsError={accountsError}
            onRetry={() => void refresh()}
            onNavigateAccounts={() => void navigate('/accounts')}
            onNavigatePosition={() => void navigate('/position-entry')}
            search={location.search}
          />
        }
      />
      <Route path="/ai-chat" element={<AiChat />} />
      <Route path="/providers" element={<ProviderSettings />} />
      <Route path="/market-data" element={<MarketDataPage />} />
      <Route path="*" element={<Navigate to="/portfolio" replace />} />
    </Routes>
  );
}
