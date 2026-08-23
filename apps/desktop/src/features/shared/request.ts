import { getDesktopApiClient } from '../../shared/api/client.js';
import type { ThesisLedgerApiClient } from '@thesis-ledger/api-client';

export type DesktopRequestClient = Pick<ThesisLedgerApiClient, 'request'>;

export const requestDesktopJson = <T>(
  path: string,
  init?: RequestInit,
  client: DesktopRequestClient = getDesktopApiClient(),
): Promise<T> => {
  const request = client.request.bind(client);
  return request<T>(path, init);
};
