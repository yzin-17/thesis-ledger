import type { AccountResponse, LedgerEvent, RiskEventResponse } from '@thesis-ledger/api-client';
import type { MobileObjectTarget } from './navigation-state';
import type { NavigatorScreenParams } from '@react-navigation/native';
import type { TransferFact } from '../features/cash-transfers/transfer-command';
import type {
  PlanKind,
  MonthlyPlan,
  MonthlyOccurrence,
} from '../features/recurring-plans/plan-api';
import type { MobileInstrument } from '../features/market-detail/market-model';
export type AccountStackParams = {
  AccountsHome: undefined;
  AccountEditor: { account?: AccountResponse };
  AccountWorkspace: { accountId: string };
  Baseline: { accountId: string };
  Drafts: { accountId: string };
  DraftReview: { accountId: string; draftId: string };
  Executions: { accountId: string };
  ExecutionEditor: {
    accountId: string;
    event?: LedgerEvent;
    action?: 'replace' | 'restore';
    supersedesEventId?: string;
  };
  Reconciliation: { accountId: string };
  Audit: { accountId: string };
  Cash: { accountId: string };
  CashEditor: { accountId: string; kind: 'observation' | 'deposit' };
  Transfers: { accountId: string };
  TransferEditor: {
    accountId: string;
    event?: TransferFact;
    action?: 'replace' | 'void' | 'restore';
  };
  Plans: { accountId: string; kind: PlanKind };
  PlanEditor: { accountId: string; kind: PlanKind; plan?: MonthlyPlan };
  OccurrenceEditor: {
    accountId: string;
    kind: PlanKind;
    occurrence: MonthlyOccurrence;
    action: 'confirm' | 'skip' | 'reopen';
  };
};
export type PortfolioStackParams = {
  PortfolioHome: undefined;
  Risk: undefined;
  RiskRules: undefined;
  RiskRuleEditor: { ruleId?: string };
  RiskEvaluate: { ruleId?: string };
  RiskAudit: { ruleId: string };
  RiskEventDetail: { event: RiskEventResponse };
  RiskNotifications: undefined;
  Performance: { accountId?: string | null } | undefined;
  PerformanceTargets: { accountId: string | null };
  Trades: { accountId: string | null } | undefined;
  TradeDetail: MobileObjectTarget;
};
export type SettingsStackParams = { SettingsHome: undefined; ChartPreview: undefined };
export type MarketStackParams = {
  MarketHome: undefined;
  MarketDetail: { instrument: MobileInstrument; accountId?: string; mode?: 'actual' | 'shadow' };
  MarketStatic: { instrument?: MobileInstrument } | undefined;
  MarketNews: { instrument?: MobileInstrument } | undefined;
  MarketAnnouncements: { q?: string } | undefined;
  MarketDocuments: undefined;
};
export type RootTabParams = {
  Portfolio: NavigatorScreenParams<PortfolioStackParams> | undefined;
  Accounts: NavigatorScreenParams<AccountStackParams> | undefined;
  Market: NavigatorScreenParams<MarketStackParams> | undefined;
  Research: MobileObjectTarget | undefined;
  Settings: NavigatorScreenParams<SettingsStackParams> | undefined;
};
