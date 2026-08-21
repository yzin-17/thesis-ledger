import { ThesisLedgerApiClient } from '@thesis-ledger/api-client';

let apiClient: ThesisLedgerApiClient | null = null;

export const getDesktopApiClient = () => {
  if (apiClient) return apiClient;
  const baseUrl =
    typeof window === 'undefined'
      ? 'http://127.0.0.1:3000/api/v1/'
      : new URL('/api/v1/', window.location.origin).toString();
  apiClient = new ThesisLedgerApiClient(baseUrl);
  return apiClient;
};
