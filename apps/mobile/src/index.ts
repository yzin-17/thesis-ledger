import { ThesisLedgerApiClient } from '@thesis-ledger/api-client';

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

export interface MobilePosition {
  id: string;
  accountId: string;
  symbol: string;
  quantity: number;
  costPrice: number;
  marketValue: number | null;
  pnl: number | null;
  stale: boolean;
  asset?: { name?: string; assetType?: string };
}

export interface MobileRiskEvent {
  id: string;
  ruleId: string;
  ruleVersion: number;
  severity: string;
  message: string;
  symbol: string | null;
  marketTime: string | null;
  evaluatedAt: string;
  context: Record<string, unknown>;
}

export interface MobileDashboardState {
  status: MobileLoadState;
  mode: MobilePortfolioMode;
  portfolio: {
    totalMarketValue: number;
    cashValue?: number;
    totalCost: number;
    totalPnl: number;
    valuedAt: string;
    positions: MobilePosition[];
  } | null;
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

const asNumber = (value: unknown) => {
  const result = Number(value);
  return Number.isFinite(result) ? result : 0;
};

const normalizePortfolio = (value: unknown): MobileDashboardState['portfolio'] => {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const positions = Array.isArray(raw.positions)
    ? raw.positions.filter((position): position is Record<string, unknown> => {
        return Boolean(position && typeof position === 'object');
      })
    : [];
  return {
    totalMarketValue: asNumber(raw.totalMarketValue),
    totalCost: asNumber(raw.totalCost),
    totalPnl: asNumber(raw.totalPnl),
    valuedAt: typeof raw.valuedAt === 'string' ? raw.valuedAt : new Date(0).toISOString(),
    positions: positions.map((position) => {
      const normalized: MobilePosition = {
        id: typeof position.id === 'string' ? position.id : '',
        accountId: typeof position.accountId === 'string' ? position.accountId : '',
        symbol: typeof position.symbol === 'string' ? position.symbol : '',
        quantity: asNumber(position.quantity),
        costPrice: asNumber(position.costPrice),
        marketValue: position.marketValue === null ? null : asNumber(position.marketValue),
        pnl: position.pnl === null ? null : asNumber(position.pnl),
        stale: position.stale === true,
      };
      if (position.asset && typeof position.asset === 'object') {
        normalized.asset = position.asset;
      }
      return normalized;
    }),
  };
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
      const cacheBust = `t=${Date.now()}`;
      const [portfolioRaw, riskEvents] = await Promise.all([
        this.api.request<unknown>(`/portfolio/valuation?mode=${this.mode}&${cacheBust}`),
        this.api.request<MobileRiskEvent[]>(`/risk/events?mode=${this.mode}&${cacheBust}`),
      ]);
      if (sequence !== this.refreshSequence) return this.state;
      const portfolio = normalizePortfolio(portfolioRaw);
      const stale = Boolean(
        portfolio?.positions.some((position) => position.stale) ||
        (portfolioRaw && typeof portfolioRaw === 'object' && 'partial' in portfolioRaw
          ? (portfolioRaw as { partial?: unknown }).partial === true
          : false),
      );
      this.setState({
        mode: this.mode,
        status:
          portfolio === null || portfolio.positions.length === 0
            ? 'empty'
            : stale
              ? 'stale'
              : 'ready',
        portfolio,
        riskEvents: Array.isArray(riskEvents) ? riskEvents : [],
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
