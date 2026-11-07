import { ThesisLedgerApiClient } from '@thesis-ledger/api-client';
import { getMobileTheme } from '../src/theme';

const api = new ThesisLedgerApiClient(new URL('/api/v1/', window.location.origin).href);
const theme = getMobileTheme('light', 'red-up');
export function useMobileRuntime() {
  return { api, theme, scope: ['arena-refresh-browser'] };
}
export function useIsFocused() {
  return true;
}
