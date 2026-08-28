import type {
  BaselineReconciliationCandidatesResponseV2,
  ConfirmBaselineReconciliationCommandV2,
  CreateExecutionCommandV2,
  LedgerAuditResponseV2,
  LedgerCommandResponseV2,
  LedgerEventsResponseV2,
  ReplaceExecutionCommandV2,
  RestoreExecutionCommandV2,
  ThesisLedgerApiClient,
  VoidExecutionCommandV2,
} from '@thesis-ledger/api-client';

import { getDesktopApiClient } from '../../shared/api/client.js';

export type AccountDataLedgerClient = Pick<
  ThesisLedgerApiClient['ledger'],
  | 'getEvents'
  | 'getEventAudit'
  | 'getReconciliationCandidates'
  | 'createExecution'
  | 'replaceExecution'
  | 'voidExecution'
  | 'restoreExecution'
  | 'confirmBaselineReconciliation'
>;

const defaultLedgerClient = () => getDesktopApiClient().ledger;

export const fetchAccountLedgerEvents = (
  accountId: string,
  client: Pick<AccountDataLedgerClient, 'getEvents'> = defaultLedgerClient(),
): Promise<LedgerEventsResponseV2> => client.getEvents(accountId);

export const fetchAccountLedgerAudit = (
  accountId: string,
  client: Pick<AccountDataLedgerClient, 'getEventAudit'> = defaultLedgerClient(),
): Promise<LedgerAuditResponseV2> => client.getEventAudit(accountId);

export const fetchReconciliationCandidates = (
  accountId: string,
  client: Pick<AccountDataLedgerClient, 'getReconciliationCandidates'> = defaultLedgerClient(),
): Promise<BaselineReconciliationCandidatesResponseV2> =>
  client.getReconciliationCandidates(accountId);

export const createExecution = (
  command: CreateExecutionCommandV2,
  client: Pick<AccountDataLedgerClient, 'createExecution'> = defaultLedgerClient(),
): Promise<LedgerCommandResponseV2> => client.createExecution(command);

export const replaceExecution = (
  command: ReplaceExecutionCommandV2,
  client: Pick<AccountDataLedgerClient, 'replaceExecution'> = defaultLedgerClient(),
): Promise<LedgerCommandResponseV2> => client.replaceExecution(command);

export const voidExecution = (
  command: VoidExecutionCommandV2,
  client: Pick<AccountDataLedgerClient, 'voidExecution'> = defaultLedgerClient(),
): Promise<LedgerCommandResponseV2> => client.voidExecution(command);

export const restoreExecution = (
  command: RestoreExecutionCommandV2,
  client: Pick<AccountDataLedgerClient, 'restoreExecution'> = defaultLedgerClient(),
): Promise<LedgerCommandResponseV2> => client.restoreExecution(command);

export const confirmBaselineReconciliation = (
  command: ConfirmBaselineReconciliationCommandV2,
  client: Pick<AccountDataLedgerClient, 'confirmBaselineReconciliation'> = defaultLedgerClient(),
): Promise<LedgerCommandResponseV2> => client.confirmBaselineReconciliation(command);
