import {
  apiErrorResponseSchema,
  baselineReconciliationCandidatesResponseSchemaV2,
  instrumentSearchResponseSchema,
  importDraftCommandResponseSchemaV2,
  importDraftRevisionResponseSchemaV2,
  journalReviewCandidatesResponseSchema,
  journalReviewSnapshotResponseSchema,
  ledgerCommandResponseSchemaV2,
  ledgerAuditResponseSchemaV2,
  ledgerEventsResponseSchemaV2,
  ledgerReplayResponseSchemaV2,
  marketDetailResponseSchema,
  performanceSummaryResponseSchema,
  portfolioValuationResponseSchema,
  riskEventsResponseSchema,
  tradeCloseSliceQueryResponseSchemaV2,
  tradeDetailResponseSchemaV2,
  tradeListResponseSchemaV2,
  tradeReferenceResolveResponseSchemaV2,
  type ApiErrorResponse,
  type CreateBaselineObservationBatchCommandV2,
  type CreateExecutionCommandV2,
  type CreateImportDraftRevisionCommandV2,
  type MoveExecutionAccountCommandV2,
  type ReplaceExecutionCommandV2,
  type RestoreExecutionCommandV2,
  type ReviseImportDraftCommandV2,
  type SubmitImportDraftRevisionCommandV2,
  type VoidExecutionCommandV2,
  type MarketDetailRequest,
  type MarketDetailResponse,
  type JournalReviewCandidatesQuery,
  type JournalReviewCandidatesResponse,
  type JournalReviewSnapshotInput,
  type JournalReviewSnapshotResponse,
  type BaselineReconciliationCandidatesResponseV2,
  type ConfirmBaselineReconciliationCommandV2,
  type RestoreBaselineReconciliationCommandV2,
  type VoidBaselineReconciliationCommandV2,
  type LedgerCommandResponseV2,
  type LedgerAuditResponseV2,
  type LedgerEventsResponseV2,
  type LedgerReplayResponseV2,
  type ImportDraftCommandResponseV2,
  type ImportDraftRevisionResponseV2,
  type TradeCloseSliceQueryResponseV2,
  type TradeDetailResponseV2,
  type TradeListQueryV2,
  type TradeListResponseV2,
  type TradeReferenceResolveRequestV2,
  type TradeReferenceResolveResponseV2,
  type CurrencyV1,
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
  JournalReviewCandidate,
  JournalReviewCandidatesQuery,
  JournalReviewCandidatesResponse,
  JournalReviewSnapshotInput,
  JournalReviewSnapshotResponse,
  LedgerEventV2,
  DecimalString,
  ExecutionChargeV2,
  LedgerCommandErrorCodeV2,
  LedgerCommandErrorV2,
  MoneyV2,
  CreateExecutionCommandV2,
  ReplaceExecutionCommandV2,
  VoidExecutionCommandV2,
  RestoreExecutionCommandV2,
  MoveExecutionAccountCommandV2,
  ExecutionCommandV2,
  CreateBaselineObservationBatchCommandV2,
  CreateImportDraftRevisionCommandV2,
  ReviseImportDraftCommandV2,
  SubmitImportDraftRevisionCommandV2,
  LedgerCommandResponseV2,
  LedgerAuditResponseV2,
  LedgerEventsResponseV2,
  LedgerReplayResponseV2,
  ImportDraftCommandResponseV2,
  ImportDraftRevisionResponseV2,
  TradeCloseSliceQueryResponseV2,
  TradeDetailResponseV2,
  TradeSummaryResponseV2,
  TradeListQueryV2,
  TradeListResponseV2,
  TradeReferenceResolveRequestV2,
  TradeReferenceResolveResponseV2,
  BaselineReconciliationCandidateV2,
  BaselineReconciliationCheckpointV2,
  BaselineReconciliationCandidatesResponseV2,
  BaselineReconciliationCommandV2,
  ConfirmBaselineReconciliationCommandV2,
  VoidBaselineReconciliationCommandV2,
  RestoreBaselineReconciliationCommandV2,
} from '@thesis-ledger/schemas';

export type { JournalLegacyReviewCandidate } from '@thesis-ledger/schemas';

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
    getValuation: (
      params: {
        mode?: 'actual' | 'shadow';
        accountId?: string;
        fxMerge?: boolean;
        baseCurrency?: CurrencyV1;
        t?: number;
      } = {},
    ) =>
      this.requestParsed(
        `/portfolio/valuation${queryString(params)}`,
        portfolioValuationResponseSchema,
      ),
    getTrades: (params: Partial<TradeListQueryV2> = {}): Promise<TradeListResponseV2> =>
      this.requestParsed(`/portfolio/trades${queryString(params)}`, tradeListResponseSchemaV2),
    getTrade: (
      accountId: string,
      tradeId: string,
      mode: 'actual' | 'shadow' = 'actual',
    ): Promise<TradeDetailResponseV2> =>
      this.requestParsed(
        `/portfolio/trades/${encodeURIComponent(tradeId)}${queryString({ accountId, mode })}`,
        tradeDetailResponseSchemaV2,
      ),
    getCloseSlice: (
      accountId: string,
      tradeId: string,
      sliceId: string,
      mode: 'actual' | 'shadow' = 'actual',
    ): Promise<TradeCloseSliceQueryResponseV2> =>
      this.requestParsed(
        `/portfolio/trades/${encodeURIComponent(tradeId)}/close-slices/${encodeURIComponent(sliceId)}${queryString({ accountId, mode })}`,
        tradeCloseSliceQueryResponseSchemaV2,
      ),
    resolveTradeReference: (
      request: TradeReferenceResolveRequestV2,
    ): Promise<TradeReferenceResolveResponseV2> =>
      this.postParsed(
        '/portfolio/trades/resolve-reference',
        request,
        tradeReferenceResolveResponseSchemaV2,
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
        fxMerge?: boolean;
        baseCurrency?: CurrencyV1;
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

  readonly journal = {
    getReviewCandidates: (
      params: Omit<JournalReviewCandidatesQuery, 'limit'> & { limit?: number },
    ): Promise<JournalReviewCandidatesResponse> =>
      this.requestParsed(
        `/journal/review-candidates${queryString(params)}`,
        journalReviewCandidatesResponseSchema,
      ),
    saveReviewSnapshot: (
      input: JournalReviewSnapshotInput,
    ): Promise<JournalReviewSnapshotResponse> =>
      this.postParsed('/journal/review-snapshots', input, journalReviewSnapshotResponseSchema),
  };

  readonly ledger = {
    createExecution: (command: CreateExecutionCommandV2): Promise<LedgerCommandResponseV2> =>
      this.postParsed('/ledger/executions', command, ledgerCommandResponseSchemaV2),
    replaceExecution: (command: ReplaceExecutionCommandV2): Promise<LedgerCommandResponseV2> =>
      this.postParsed('/ledger/executions/replace', command, ledgerCommandResponseSchemaV2),
    voidExecution: (command: VoidExecutionCommandV2): Promise<LedgerCommandResponseV2> =>
      this.postParsed('/ledger/executions/void', command, ledgerCommandResponseSchemaV2),
    restoreExecution: (command: RestoreExecutionCommandV2): Promise<LedgerCommandResponseV2> =>
      this.postParsed('/ledger/executions/restore', command, ledgerCommandResponseSchemaV2),
    moveExecutionAccount: (
      command: MoveExecutionAccountCommandV2,
    ): Promise<LedgerCommandResponseV2> =>
      this.postParsed('/ledger/executions/move-account', command, ledgerCommandResponseSchemaV2),
    createBaselineObservationBatch: (
      command: CreateBaselineObservationBatchCommandV2,
    ): Promise<LedgerCommandResponseV2> =>
      this.postParsed(
        '/ledger/baseline-observation-batches',
        command,
        ledgerCommandResponseSchemaV2,
      ),
    createImportDraftRevision: (
      command: CreateImportDraftRevisionCommandV2,
    ): Promise<ImportDraftCommandResponseV2> =>
      this.postParsed(
        '/ledger/import-draft-revisions',
        command,
        importDraftCommandResponseSchemaV2,
      ),
    reviseImportDraft: (
      command: ReviseImportDraftCommandV2,
    ): Promise<ImportDraftRevisionResponseV2> =>
      this.postParsed(
        '/ledger/import-draft-revisions/revise',
        command,
        importDraftRevisionResponseSchemaV2,
      ),
    submitImportDraftRevision: (
      command: SubmitImportDraftRevisionCommandV2,
    ): Promise<LedgerCommandResponseV2> =>
      this.postParsed(
        '/ledger/import-draft-revisions/submit',
        command,
        ledgerCommandResponseSchemaV2,
      ),
    getEvents: (
      accountId: string,
      params: { asOfRevision?: string } = {},
    ): Promise<LedgerEventsResponseV2> =>
      this.requestParsed(
        `/ledger/${encodeURIComponent(accountId)}/events${queryString(params)}`,
        ledgerEventsResponseSchemaV2,
      ),
    getEventAudit: (
      accountId: string,
      params: { asOfRevision?: string } = {},
    ): Promise<LedgerAuditResponseV2> =>
      this.requestParsed(
        `/ledger/${encodeURIComponent(accountId)}/events/audit${queryString(params)}`,
        ledgerAuditResponseSchemaV2,
      ),
    replayEvents: (accountId: string, asOfRevision: string): Promise<LedgerReplayResponseV2> =>
      this.requestParsed(
        `/ledger/${encodeURIComponent(accountId)}/events/replay${queryString({ asOfRevision })}`,
        ledgerReplayResponseSchemaV2,
      ),
    getReconciliationCandidates: (
      accountId: string,
    ): Promise<BaselineReconciliationCandidatesResponseV2> =>
      this.requestParsed(
        `/ledger/${encodeURIComponent(accountId)}/reconciliation-candidates`,
        baselineReconciliationCandidatesResponseSchemaV2,
      ),
    confirmBaselineReconciliation: (
      command: ConfirmBaselineReconciliationCommandV2,
    ): Promise<LedgerCommandResponseV2> =>
      this.postParsed('/ledger/reconciliations/confirm', command, ledgerCommandResponseSchemaV2),
    voidBaselineReconciliation: (
      command: VoidBaselineReconciliationCommandV2,
    ): Promise<LedgerCommandResponseV2> =>
      this.postParsed('/ledger/reconciliations/void', command, ledgerCommandResponseSchemaV2),
    restoreBaselineReconciliation: (
      command: RestoreBaselineReconciliationCommandV2,
    ): Promise<LedgerCommandResponseV2> =>
      this.postParsed('/ledger/reconciliations/restore', command, ledgerCommandResponseSchemaV2),
  };

  constructor(baseUrl: string, fetcher?: typeof fetch) {
    this.baseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
    this.fetcher = fetcher ?? globalThis.fetch.bind(globalThis);
  }

  async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await this.fetchResponse(path, init);
    return (await response.json()) as T;
  }

  private postParsed<T>(
    path: string,
    body: unknown,
    schema: { safeParse(value: unknown): { success: true; data: T } | { success: false } },
  ): Promise<T> {
    return this.requestParsed(path, schema, {
      method: 'POST',
      body: JSON.stringify(body),
    });
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
    const requestInit: RequestInit = { ...init };
    const isMultipart = typeof FormData !== 'undefined' && init?.body instanceof FormData;
    if (!isMultipart) {
      requestInit.headers = { 'content-type': 'application/json', ...init?.headers };
    }
    const response = await this.fetcher(
      new URL(path.replace(/^\/+/, ''), this.baseUrl),
      requestInit,
    );
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
