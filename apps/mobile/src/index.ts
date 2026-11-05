import type { PortfolioValuationResponse, RiskEventResponse } from '@thesis-ledger/api-client';

export type MobileLoadState = 'loading' | 'ready' | 'empty' | 'error' | 'stale';
export type MobilePortfolioMode = 'actual' | 'shadow';

export const mobileStateCopy: Record<MobileLoadState, { title: string; description: string }> = {
  loading: { title: '正在加载', description: '正在读取 ThesisLedger 数据。' },
  ready: { title: '数据已更新', description: '当前数据来自 ThesisLedger API。' },
  empty: { title: '暂无数据', description: '完成账户或持仓配置后，这里会显示数据。' },
  error: { title: '读取失败', description: '当前内容未更新为正常值，请稍后重试。' },
  stale: { title: '数据可能陈旧', description: '部分来源不可用，结果保留陈旧标记。' },
};

export const resolveMobileApiBaseUrl = ({
  explicitBaseUrl,
  platform,
}: {
  explicitBaseUrl?: string | undefined;
  platform: string;
}) => {
  const configuredBaseUrl = explicitBaseUrl?.trim();
  if (configuredBaseUrl) return configuredBaseUrl;
  return platform === 'android' ? 'http://10.0.2.2:3000/api/v1' : 'http://127.0.0.1:3000/api/v1';
};

export type MobilePosition = PortfolioValuationResponse['positions'][number];
export type MobileRiskEvent = RiskEventResponse;

export interface MobileDashboardState {
  status: MobileLoadState;
  mode: MobilePortfolioMode;
  portfolio: PortfolioValuationResponse | null;
  riskEvents: MobileRiskEvent[];
  error: string | null;
}
