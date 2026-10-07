import { ThesisLedgerApiError, ThesisLedgerContractError } from '@thesis-ledger/api-client';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

export const ledgerContractRejected = (error: unknown) => {
  if (error instanceof ThesisLedgerApiError)
    return error.payload?.error === 'UNSUPPORTED_CONTRACT_VERSION';
  return error instanceof ThesisLedgerContractError && error.path.startsWith('/ledger/');
};

export const ledgerContractErrorMessage = '此账户包含不受支持的账本记录，无法读取或修订。';

export function LedgerContractFailure({ onRetry }: { onRetry: () => Promise<unknown> }) {
  return (
    <Alert variant="destructive">
      <AlertTitle>账本记录格式不受支持</AlertTitle>
      <AlertDescription>{ledgerContractErrorMessage}</AlertDescription>
      <Button type="button" variant="outline" size="sm" onClick={() => void onRetry()}>
        重新加载
      </Button>
    </Alert>
  );
}
