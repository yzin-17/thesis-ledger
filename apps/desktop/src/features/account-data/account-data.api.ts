import type {
  BaselineReconciliationCandidatesResponse,
  ConfirmBaselineReconciliationCommand,
  CreateExecutionCommand,
  LedgerAuditResponse,
  LedgerCommandResponse,
  LedgerEventsResponse,
  ReplaceExecutionCommand,
  RestoreExecutionCommand,
  ThesisLedgerApiClient,
  VoidExecutionCommand,
} from '@thesis-ledger/api-client';

import { getDesktopApiClient } from '../../shared/api/client.js';
import { ThesisLedgerContractError } from '@thesis-ledger/api-client';

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
): Promise<LedgerEventsResponse> => client.getEvents(accountId);

export const fetchAccountLedgerAudit = (
  accountId: string,
  client: Pick<AccountDataLedgerClient, 'getEventAudit'> = defaultLedgerClient(),
): Promise<LedgerAuditResponse> => client.getEventAudit(accountId);

export const fetchReconciliationCandidates = async (
  accountId: string,
  client: Pick<AccountDataLedgerClient, 'getReconciliationCandidates'> = defaultLedgerClient(),
): Promise<BaselineReconciliationCandidatesResponse> => {
  const result = await client.getReconciliationCandidates(accountId);
  if (result.accountId !== accountId)
    throw new ThesisLedgerContractError('/ledger/reconciliation-candidates');
  return result;
};

export const createExecution = (
  command: CreateExecutionCommand,
  client: Pick<AccountDataLedgerClient, 'createExecution'> = defaultLedgerClient(),
): Promise<LedgerCommandResponse> => client.createExecution(command);

export const replaceExecution = (
  command: ReplaceExecutionCommand,
  client: Pick<AccountDataLedgerClient, 'replaceExecution'> = defaultLedgerClient(),
): Promise<LedgerCommandResponse> => client.replaceExecution(command);

export const voidExecution = (
  command: VoidExecutionCommand,
  client: Pick<AccountDataLedgerClient, 'voidExecution'> = defaultLedgerClient(),
): Promise<LedgerCommandResponse> => client.voidExecution(command);

export const restoreExecution = (
  command: RestoreExecutionCommand,
  client: Pick<AccountDataLedgerClient, 'restoreExecution'> = defaultLedgerClient(),
): Promise<LedgerCommandResponse> => client.restoreExecution(command);

export const confirmBaselineReconciliation = (
  command: ConfirmBaselineReconciliationCommand,
  client: Pick<AccountDataLedgerClient, 'confirmBaselineReconciliation'> = defaultLedgerClient(),
): Promise<LedgerCommandResponse> => client.confirmBaselineReconciliation(command);
