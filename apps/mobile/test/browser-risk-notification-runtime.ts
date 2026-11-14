import { ThesisLedgerApiClient } from '@thesis-ledger/api-client';
import { getMobileTheme } from '../src/theme';
const theme = getMobileTheme('light', 'red-up');
const api = new ThesisLedgerApiClient(new URL('/api/v1/', window.location.origin).href);
export const useMobileRuntime = () => ({
  theme,
  api,
  scope: ['risk-notification-browser', window.location.origin, 'actual' as const],
  baseUrl: window.location.origin,
  mode: 'actual' as const,
});
export const useDirtyForm = () => {};
export const confirmAction = async () => true;
