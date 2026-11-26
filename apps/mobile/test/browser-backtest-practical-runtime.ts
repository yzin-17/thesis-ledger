import { ThesisLedgerApiClient } from '@thesis-ledger/api-client';
import { getMobileTheme } from '../src/theme';
const api = new ThesisLedgerApiClient(new URL('/api/v1/', location.origin).href);
export const useMobileRuntime = () => ({ theme: getMobileTheme('light', 'red-up'), api,
  scope: ['backtest-practical-browser', location.origin, 'actual' as const], baseUrl: location.origin });
export const useDirtyForm = () => {};
export const randomUUID = () => crypto.randomUUID();
export const exportCsv = async () => { throw Error('此浏览器样本不执行原生系统导出'); };
export const confirmAction = async () => true;
export const useIsFocused = () => true;
export const useRoute = () => ({ params: { id: (window as unknown as { practicalRunId: string }).practicalRunId,
  kind: 'ordinary', strategyId: 'practical-strategy', versionId: '11111111-1111-4111-8111-111111111111' } });
export const useNavigation = () => ({
  navigate: (_screen: string, params: { id: string }) => { location.search = `?run=${params.id}`; },
  replace: (_screen: string, params: { id: string }) => { location.search = `?run=${params.id}`; },
});
export default { getItem: async (key: string) => localStorage.getItem(key),
  setItem: async (key: string, value: string) => localStorage.setItem(key, value),
  removeItem: async (key: string) => localStorage.removeItem(key) };
