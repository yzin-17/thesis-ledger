import {
  apiErrorResponseSchema,
  instrumentSearchResponseSchema,
  marketDetailResponseSchema,
  performanceSummaryResponseSchema,
  portfolioValuationResponseSchema,
  riskEventsResponseSchema,
  type ApiErrorResponse,
  type MarketDetailRequest,
  type MarketDetailResponse,
} from '@thesis-ledger/schemas';

export type {
  ApiErrorResponse,
  InstrumentSearchResult,
  PerformanceSummaryResponse,
  PortfolioValuationResponse,
  RiskEventResponse,
  MarketDetailCapability,
  MarketDetailRequest,
  MarketDetailResponse,
  MarketDetailSection,
  MarketDetailSectionStatus,
} from '@thesis-ledger/schemas';

export type MarketDetailQuery = Omit<MarketDetailRequest, 'symbol'> & {
  signal?: AbortSignal;
};

type QueryValue = string | number | boolean | readonly string[] | undefined;

const queryString = (params: Record<string, QueryValue>) => {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    query.set(key, Array.isArray(value) ? value.join(',') : String(value));
  }
  const encoded = query.toString();
  return encoded ? `?${encoded}` : '';
};

export class ThesisLedgerApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly payload: ApiErrorResponse | null,
  ) {
    super(`ThesisLedger API ${status}${payload?.message ? `: ${payload.message}` : ''}`);
  }
}

export class ThesisLedgerContractError extends Error {
  constructor(public readonly path: string) {
    super(`ThesisLedger API 响应契约不匹配: ${path}`);
  }
}

export class ThesisLedgerApiClient {
  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch;

  readonly portfolio = {
    getValuation: (params: { mode?: 'actual' | 'shadow'; accountId?: string; t?: number } = {}) =>
      this.requestParsed(
        `/portfolio/valuation${queryString(params)}`,
        portfolioValuationResponseSchema,
      ),
  };

  readonly risk = {
    getEvents: (
      params: { mode?: 'actual' | 'shadow'; cursor?: string; limit?: number; t?: number } = {},
    ) => this.requestParsed(`/risk/events${queryString(params)}`, riskEventsResponseSchema),
  };

  readonly performance = {
    getSummary: (
      params: {
        accountId?: string;
        start?: string;
        end?: string;
        mode?: 'actual' | 'shadow';
      } = {},
    ) =>
      this.requestParsed(
        `/performance/summary${queryString(params)}`,
        performanceSummaryResponseSchema,
      ),
  };

  readonly market = {
    searchInstruments: (params: { q: string; limit?: number }) =>
      this.requestParsed(
        `/market-data/instruments/search${queryString(params)}`,
        instrumentSearchResponseSchema,
      ),
    getDetail: (symbol: string, params: MarketDetailQuery = {}) => {
      const { signal, refresh, include, ...query } = params;
      return this.requestParsed<MarketDetailResponse>(
        `/market/${encodeURIComponent(symbol)}/detail${queryString({
          ...query,
          ...(refresh ? { refresh: 1 } : {}),
          ...(include ? { include } : {}),
        })}`,
        marketDetailResponseSchema,
        signal ? { signal } : undefined,
      );
    },
  };

  constructor(baseUrl: string, fetcher?: typeof fetch) {
    this.baseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
    this.fetcher = fetcher ?? globalThis.fetch.bind(globalThis);
  }

  async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await this.fetchResponse(path, init);
    return (await response.json()) as T;
  }

  private async requestParsed<T>(
    path: string,
    schema: { safeParse(value: unknown): { success: true; data: T } | { success: false } },
    init?: RequestInit,
  ): Promise<T> {
    const response = await this.fetchResponse(path, init);
    const raw: unknown = await response.json();
    const parsed = schema.safeParse(raw);
    if (!parsed.success) throw new ThesisLedgerContractError(path);
    return parsed.data;
  }

  private async fetchResponse(path: string, init?: RequestInit) {
    const response = await this.fetcher(new URL(path.replace(/^\/+/, ''), this.baseUrl), {
      ...init,
      headers: { 'content-type': 'application/json', ...init?.headers },
    });
    if (response.ok) return response;
    let payload: ApiErrorResponse | null = null;
    try {
      const raw: unknown = await response.json();
      const parsed = apiErrorResponseSchema.safeParse(raw);
      if (parsed.success) payload = parsed.data;
    } catch {
      payload = null;
    }
    throw new ThesisLedgerApiError(response.status, payload);
  }
}
