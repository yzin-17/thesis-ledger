import { ThesisLedgerApiError } from '@thesis-ledger/api-client';

export function occurrenceRequiresReload(error: unknown): boolean {
  return (
    error instanceof ThesisLedgerApiError &&
    error.status === 409 &&
    error.payload?.errorCode !== 'LEDGER_INSUFFICIENT_CASH'
  );
}
