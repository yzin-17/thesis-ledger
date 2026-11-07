import { createDeferredPage } from './DeferredPage.js';
export const ArenaWeekPage = createDeferredPage(() =>
  import('../features/model-arena/ArenaWeekPage.js').then((module) => ({
    default: module.ArenaWeekPage,
  })),
);
export const WatchlistPage = createDeferredPage(() =>
  import('../features/watchlist/WatchlistPage.js').then((module) => ({
    default: module.WatchlistPage,
  })),
);
export const AccountDataPage = createDeferredPage(() =>
  import('../features/account-data/AccountDataPage.js').then((module) => ({
    default: module.AccountDataPage,
  })),
);
export const AiChat = createDeferredPage(() =>
  import('../features/ai/AiChat.js').then((module) => ({ default: module.AiChat })),
);
export const JournalReviewWorkspace = createDeferredPage(() =>
  import('../features/journal/review/JournalReviewWorkspace.js').then((module) => ({
    default: module.JournalReviewWorkspace,
  })),
);
export const PerformanceWorkspace = createDeferredPage(() =>
  import('./PerformanceWorkspace.js').then((module) => ({ default: module.PerformanceWorkspace })),
);
export const ProviderSettings = createDeferredPage(() =>
  import('../features/providers/ProviderSettings.js').then((module) => ({
    default: module.ProviderSettings,
  })),
);
export const RiskCenter = createDeferredPage(() =>
  import('../features/risk/RiskCenter.js').then((module) => ({ default: module.RiskCenter })),
);
export const StrategyDashboard = createDeferredPage(() =>
  import('../features/strategy/StrategyDashboard.js').then((module) => ({
    default: module.StrategyDashboard,
  })),
);
export const MarketDataPage = createDeferredPage(() =>
  import('../features/market-data/MarketDataPage.js').then((module) => ({
    default: module.MarketDataPage,
  })),
);
