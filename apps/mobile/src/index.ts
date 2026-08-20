import {
  ThesisLedgerApiClient,
  type PortfolioValuationResponse,
  type RiskEventResponse,
} from '@thesis-ledger/api-client';

export type MobileLoadState = 'loading' | 'ready' | 'empty' | 'error' | 'stale';
export type MobilePortfolioMode = 'actual' | 'shadow';

export const mobileStateCopy: Record<MobileLoadState, { title: string; description: string }> = {
  loading: { title: '正在加载', description: '正在读取 ThesisLedger 数据。' },
  ready: { title: '数据已更新', description: '当前数据来自 ThesisLedger API。' },
  empty: { title: '暂无数据', description: '完成账户或持仓配置后，这里会显示数据。' },
  error: { title: '读取失败', description: '当前内容未更新为正常值，请稍后重试。' },
  stale: { title: '数据可能陈旧', description: '部分来源不可用，结果保留陈旧标记。' },
};

export interface MobileBootstrapOptions {
  apiBaseUrl: string;
  fetcher?: typeof fetch;
}

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

export const mobileNavigation = [
  { key: 'portfolio', label: '投资组合', readOnly: true },
  { key: 'risk', label: '风险事件', readOnly: true },
] as const;

const initialState: MobileDashboardState = {
  status: 'loading',
  mode: 'actual',
  portfolio: null,
  riskEvents: [],
  error: null,
};

export class MobileReadOnlyStore {
  private state: MobileDashboardState = initialState;
  private readonly listeners = new Set<() => void>();
  private refreshSequence = 0;
  private mode: MobilePortfolioMode = 'actual';

  constructor(private readonly api: ThesisLedgerApiClient) {}

  getState() {
    return this.state;
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getMode() {
    return this.mode;
  }

  setMode(mode: MobilePortfolioMode) {
    if (mode === this.mode) return;
    this.mode = mode;
    this.setState({ ...this.state, mode, status: 'loading', error: null });
    void this.refresh();
  }

  private setState(next: MobileDashboardState) {
    this.state = next;
    for (const listener of this.listeners) listener();
  }

  async refresh() {
    const sequence = ++this.refreshSequence;
    const previous = this.state;
    this.setState({ ...previous, status: 'loading', error: null });
    try {
      const cacheBust = Date.now();
      const [portfolio, riskEvents] = await Promise.all([
        this.api.portfolio.getValuation({ mode: this.mode, t: cacheBust }),
        this.api.risk.getEvents({ mode: this.mode, t: cacheBust }),
      ]);
      if (sequence !== this.refreshSequence) return this.state;
      const stale = portfolio.partial || portfolio.positions.some((position) => position.stale);
      this.setState({
        mode: this.mode,
        status: portfolio.positions.length === 0 ? 'empty' : stale ? 'stale' : 'ready',
        portfolio,
        riskEvents,
        error: null,
      });
    } catch (error) {
      if (sequence !== this.refreshSequence) return this.state;
      this.setState({
        ...previous,
        status: 'error',
        error: error instanceof Error ? error.message : '移动端数据读取失败',
      });
    }
    return this.state;
  }
}

export const createMobileBootstrap = (options: MobileBootstrapOptions) => {
  const api = new ThesisLedgerApiClient(
    options.apiBaseUrl,
    options.fetcher ?? globalThis.fetch.bind(globalThis),
  );
  return {
    platform: 'react-native' as const,
    apiBaseUrl: options.apiBaseUrl,
    navigation: mobileNavigation,
    store: new MobileReadOnlyStore(api),
  };
};
