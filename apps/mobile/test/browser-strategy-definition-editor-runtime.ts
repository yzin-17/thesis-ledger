import { ThesisLedgerApiClient } from '@thesis-ledger/api-client';
import { getMobileTheme } from '../src/theme';
const theme = getMobileTheme('light', 'red-up');
const api = new ThesisLedgerApiClient(new URL('/api/v1/', location.origin).href);
export const useMobileRuntime = () => ({
  theme,
  api,
  scope: ['strategy-editor-controlled'],
  baseUrl: location.origin,
  mode: 'actual' as const,
});
export const useDirtyForm = () => {};
export const useRoute = () => ({
  params: { strategyId: 'editor-strategy', versionId: 'editor-version' },
});
export const useNavigation = () => ({ navigate: () => {} });
export default {
  getItem: async (key: string) => localStorage.getItem(key),
  setItem: async (key: string, value: string) => localStorage.setItem(key, value),
  removeItem: async (key: string) => localStorage.removeItem(key),
};
