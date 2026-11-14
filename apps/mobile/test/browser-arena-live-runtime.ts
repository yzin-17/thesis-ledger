import { ThesisLedgerApiClient } from '@thesis-ledger/api-client';
import { getMobileTheme } from '../src/theme';
const baseUrl = window.location.origin;
const api = new ThesisLedgerApiClient(new URL('/api/v1/', baseUrl).href);
const theme = getMobileTheme('light', 'red-up');
export const useMobileRuntime = () => ({ api, theme, baseUrl, scope: ['arena-live-browser', baseUrl] });
export const useIsFocused = () => true;
