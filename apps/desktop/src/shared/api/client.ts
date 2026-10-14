import { ThesisLedgerApiClient } from '@thesis-ledger/api-client';
import { createRateLimitedFetch } from './rate-limited-fetch.js';
import { withIdentitySession } from './identity-session.js';

let apiClient: ThesisLedgerApiClient | null = null;

export const getDesktopApiClient = () => {
  if (apiClient) return apiClient;
  const baseUrl =
    typeof window === 'undefined'
      ? 'http://127.0.0.1:3000/api/v1/'
      : new URL('/api/v1/', window.location.origin).toString();
  const limitedFetch = createRateLimitedFetch();
  apiClient = new ThesisLedgerApiClient(baseUrl, (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input, baseUrl);
    if (url.origin === new URL(baseUrl).origin && url.pathname.startsWith('/api/v1/'))
      return limitedFetch(input, withIdentitySession(init));
    return limitedFetch(input, init);
  });
  return apiClient;
};
