import type { AccountResponse, LedgerEvent } from '@thesis-ledger/api-client';
import type { MobileObjectTarget } from './navigation-state';
import type { NavigatorScreenParams } from '@react-navigation/native';
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
};
export type PortfolioStackParams = {
  PortfolioHome: undefined;
  Risk: undefined;
  Trades: { accountId: string | null } | undefined;
  TradeDetail: MobileObjectTarget;
};
export type SettingsStackParams = { SettingsHome: undefined; ChartPreview: undefined };
export type RootTabParams = {
  Portfolio: NavigatorScreenParams<PortfolioStackParams> | undefined;
  Accounts: NavigatorScreenParams<AccountStackParams> | undefined;
  Market: undefined;
  Research: MobileObjectTarget | undefined;
  Settings: NavigatorScreenParams<SettingsStackParams> | undefined;
};
