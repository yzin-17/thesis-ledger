import { journalReviewClient } from './journal-review-client.js';
import { backtestRunClient } from './backtest-run-client.js';
import { marketControlClient } from './market-control-client.js';
import { backtestRunConfigClient } from './backtest-run-config-client.js';
import { backtestNavRunClient } from './backtest-nav-run-client.js';
import {
  apiErrorResponseSchema,
  accountsResponseSchema,
  baselineReconciliationCandidatesResponseSchema,
  instrumentSearchResponseSchema,
  importDraftCommandResponseSchema,
  importDraftRevisionResponseSchema,
  ledgerCommandResponseSchema,
  ledgerAuditResponseSchema,
  ledgerEventsResponseSchema,
  ledgerReplayResponseSchema,
  marketDetailResponseSchema,
  marketChartOptionsV3Schema,
  marketChartOptionsWindowV3Schema,
  type MarketChartOptionsWindowV3,
  marketChartPlanV3Schema,
  type MarketChartPlanV3,
  performanceSummaryResponseSchema,
  portfolioValuationResponseSchema,
  riskEventsResponseSchema,
  recurringCashDepositOccurrenceSchema,
  recurringCashDepositOccurrencesResponseSchema,
  recurringCashDepositPlanSchema,
  recurringCashDepositPlansResponseSchema,
  recurringFundInvestmentOccurrenceSchema,
  recurringFundInvestmentOccurrencesResponseSchema,
  recurringFundInvestmentPlanSchema,
  recurringFundInvestmentPlansResponseSchema,
  tradeCloseSliceQueryResponseSchema,
  tradeDetailResponseSchema,
  tradeListResponseSchema,
  tradeReferenceResolveResponseSchema,
  type ApiErrorResponse,
  type AccountResponse,
  type AccountMode,
  type CreateBaselineObservationBatchCommand,
  type CreateCashFlowCommand,
  type CreateCashTransferCommand,
  type CreateExecutionCommand,
  type CreateTradeOpeningBoundaryAssertionCommand,
  type CreateImportDraftRevisionCommand,
  type MoveExecutionAccountCommand,
  type ReplaceExecutionCommand,
  type ReplaceCashFlowCommand,
  type ReplaceCashTransferCommand,
  type RestoreExecutionCommand,
  type RestoreCashFlowCommand,
  type RestoreCashTransferCommand,
  type ReviseImportDraftCommand,
  type SubmitImportDraftRevisionCommand,
  type VoidExecutionCommand,
  type VoidCashFlowCommand,
  type VoidCashTransferCommand,
  type MarketDetailRequest,
  type MarketDetailResponse,
  type BaselineReconciliationCandidatesResponse,
  type ConfirmBaselineReconciliationCommand,
  type RestoreBaselineReconciliationCommand,
  type VoidBaselineReconciliationCommand,
  type LedgerCommandResponse,
  type LedgerAuditResponse,
  type LedgerEventsResponse,
  type LedgerReplayResponse,
  type ImportDraftCommandResponse,
  type ImportDraftRevisionResponse,
  type TradeCloseSliceQueryResponse,
  type TradeDetailResponse,
  type TradeListQuery,
  type TradeListResponse,
  type TradeReferenceResolveRequest,
  type TradeReferenceResolveResponse,
  type Currency,
  type ConfirmRecurringCashDepositOccurrence,
  type CreateRecurringCashDepositPlan,
  type RecurringCashDepositOccurrence,
  type RecurringCashDepositPlan,
  type UpdateRecurringCashDepositPlan,
  type ConfirmRecurringFundInvestmentOccurrence,
  type CreateRecurringFundInvestmentPlan,
  type RecurringFundInvestmentOccurrence,
  type RecurringFundInvestmentPlan,
  type UpdateRecurringFundInvestmentPlan,
} from '@thesis-ledger/schemas';

export type {
  JournalReviewCandidateContract,
  JournalReviewListContract,
  JournalReviewAnalysisResponse,
  JournalReviewSnapshotRequest,
  JournalDeterministicReview,
  JournalSnapshotHistoryQuery,
  JournalSnapshotHistoryResponse,
  JournalStoredSnapshotView,
  JournalPeriodReviewRequest,
  JournalPeriodReviewResponse,
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
  LedgerEvent,
  DecimalString,
  ExecutionCharge,
  LedgerCommandErrorCode,
  LedgerCommandError,
  LedgerMoney,
  CashFlowPayload,
  CashTransferMetadata,
  CreateCashFlowCommand,
  ReplaceCashFlowCommand,
  VoidCashFlowCommand,
  RestoreCashFlowCommand,
  CashFlowCommand,
  CreateCashTransferCommand,
  ReplaceCashTransferCommand,
  VoidCashTransferCommand,
  RestoreCashTransferCommand,
  CashTransferCommand,
  CreateExecutionCommand,
  CreateTradeOpeningBoundaryAssertionCommand,
  ReplaceExecutionCommand,
  VoidExecutionCommand,
  RestoreExecutionCommand,
  MoveExecutionAccountCommand,
  ExecutionCommand,
  CreateBaselineObservationBatchCommand,
  CreateImportDraftRevisionCommand,
  ReviseImportDraftCommand,
  SubmitImportDraftRevisionCommand,
  LedgerCommandResponse,
  LedgerAuditResponse,
  LedgerEventsResponse,
  LedgerReplayResponse,
  ImportDraftCommandResponse,
  ImportDraftRevisionResponse,
  TradeCloseSliceQueryResponse,
  TradeDetailResponse,
  TradeSummaryResponse,
  TradeListQuery,
  TradeListResponse,
  TradeReferenceResolveRequest,
  TradeReferenceResolveResponse,
  BaselineReconciliationCandidate,
  BaselineReconciliationCheckpoint,
  BaselineReconciliationCandidatesResponse,
  BaselineReconciliationCommand,
  ConfirmBaselineReconciliationCommand,
  VoidBaselineReconciliationCommand,
  RestoreBaselineReconciliationCommand,
  ConfirmRecurringCashDepositOccurrence,
  CreateRecurringCashDepositPlan,
  RecurringCashDepositOccurrence,
  RecurringCashDepositPlan,
  UpdateRecurringCashDepositPlan,
  ConfirmRecurringFundInvestmentOccurrence,
  CreateRecurringFundInvestmentPlan,
  RecurringFundInvestmentOccurrence,
  RecurringFundInvestmentPlan,
  UpdateRecurringFundInvestmentPlan,
  BacktestRunCreateV3,
  BacktestRunPreparationRequestV3,
  BacktestRunPreparationResultV3,
  BacktestRunPreflightRequestV3,
  BacktestPreflightResultV3,
  BacktestRunResponseV3,
  BacktestNavPreparationRequestV3,
  BacktestNavPreparationResultV3,
  BacktestNavRunCreateV3,
  BacktestNavRunResponseV3,
  BacktestNavRunSummaryV3,
  AiCostFacts,
  AiExecutionSummary,
  AiGenerationContractRef,
  AiGenerationError,
  AiProviderModelExecution,
  AiRequestAttempt,
  AiResearchGeneration,
  AiResearchPolicyV1,
  AiResearchRetryPrefill,
  AiResearchStartInput,
  AiUsageFacts,
  AiUsageSummaryReadModel,
  OptimizationTradingCostDisclosure,
  InstrumentDirectory,
  AccountResponse,
  AccountMode,
} from '@thesis-ledger/schemas';

export type {
  AccountPermanentDeletionErrorCode,
  JournalLegacyReviewCandidate,
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

  readonly accounts = {
    list: (
      params: { includeInactive?: boolean; mode?: AccountMode } = {},
    ): Promise<AccountResponse[]> =>
      this.requestParsed(`/accounts${queryString(params)}`, accountsResponseSchema),
    permanentDelete: (accountId: string): Promise<void> =>
      this.deleteNoContent(`/accounts/${encodeURIComponent(accountId)}/permanent`),
  };

  readonly portfolio = {
    getValuation: (
      params: {
        mode?: 'actual' | 'shadow';
        accountId?: string;
        fxMerge?: boolean;
        baseCurrency?: Currency;
        t?: number;
      } = {},
    ) =>
      this.requestParsed(
        `/portfolio/valuation${queryString(params)}`,
        portfolioValuationResponseSchema,
      ),
    getTrades: (params: Partial<TradeListQuery> = {}): Promise<TradeListResponse> =>
      this.requestParsed(`/portfolio/trades${queryString(params)}`, tradeListResponseSchema),
    getTrade: (
      accountId: string,
      tradeId: string,
      mode: 'actual' | 'shadow' = 'actual',
    ): Promise<TradeDetailResponse> =>
      this.requestParsed(
        `/portfolio/trades/${encodeURIComponent(tradeId)}${queryString({ accountId, mode })}`,
        tradeDetailResponseSchema,
      ),
    getCloseSlice: (
      accountId: string,
      tradeId: string,
      sliceId: string,
      mode: 'actual' | 'shadow' = 'actual',
    ): Promise<TradeCloseSliceQueryResponse> =>
      this.requestParsed(
        `/portfolio/trades/${encodeURIComponent(tradeId)}/close-slices/${encodeURIComponent(sliceId)}${queryString({ accountId, mode })}`,
        tradeCloseSliceQueryResponseSchema,
      ),
    resolveTradeReference: (
      request: TradeReferenceResolveRequest,
    ): Promise<TradeReferenceResolveResponse> =>
      this.postParsed(
        '/portfolio/trades/resolve-reference',
        request,
        tradeReferenceResolveResponseSchema,
      ),
    createTradeOpeningBoundary: (
      tradeId: string,
      command: CreateTradeOpeningBoundaryAssertionCommand,
    ): Promise<LedgerCommandResponse> =>
      this.postParsed(
        `/portfolio/trades/${encodeURIComponent(tradeId)}/opening-boundary`,
        command,
        ledgerCommandResponseSchema,
      ),
  };

  readonly cashDeposits = {
    getPlans: (
      params: { accountId?: string; status?: 'ACTIVE' | 'PAUSED' | 'ENDED' } = {},
    ): Promise<RecurringCashDepositPlan[]> =>
      this.requestParsed(
        `/cash-deposit-plans${queryString(params)}`,
        recurringCashDepositPlansResponseSchema,
      ),
    createPlan: (input: CreateRecurringCashDepositPlan): Promise<RecurringCashDepositPlan> =>
      this.postParsed('/cash-deposit-plans', input, recurringCashDepositPlanSchema),
    updatePlan: (
      id: string,
      input: UpdateRecurringCashDepositPlan,
    ): Promise<RecurringCashDepositPlan> =>
      this.patchParsed(
        `/cash-deposit-plans/${encodeURIComponent(id)}`,
        input,
        recurringCashDepositPlanSchema,
      ),
    pausePlan: (id: string, expectedVersion: number): Promise<RecurringCashDepositPlan> =>
      this.postParsed(
        `/cash-deposit-plans/${encodeURIComponent(id)}/pause`,
        { expectedVersion },
        recurringCashDepositPlanSchema,
      ),
    resumePlan: (id: string, expectedVersion: number): Promise<RecurringCashDepositPlan> =>
      this.postParsed(
        `/cash-deposit-plans/${encodeURIComponent(id)}/resume`,
        { expectedVersion },
        recurringCashDepositPlanSchema,
      ),
    endPlan: (id: string, expectedVersion: number): Promise<RecurringCashDepositPlan> =>
      this.postParsed(
        `/cash-deposit-plans/${encodeURIComponent(id)}/end`,
        { expectedVersion },
        recurringCashDepositPlanSchema,
      ),
    getOccurrences: (
      params: {
        accountId?: string;
        planId?: string;
        status?: 'PENDING' | 'CONFIRMED' | 'SKIPPED';
      } = {},
    ): Promise<RecurringCashDepositOccurrence[]> =>
      this.requestParsed(
        `/cash-deposit-occurrences${queryString(params)}`,
        recurringCashDepositOccurrencesResponseSchema,
      ),
    confirmOccurrence: (
      id: string,
      input: ConfirmRecurringCashDepositOccurrence,
    ): Promise<RecurringCashDepositOccurrence> =>
      this.postParsed(
        `/cash-deposit-occurrences/${encodeURIComponent(id)}/confirm`,
        input,
        recurringCashDepositOccurrenceSchema,
      ),
    skipOccurrence: (
      id: string,
      input: { expectedVersion: number; reason: string },
    ): Promise<RecurringCashDepositOccurrence> =>
      this.postParsed(
        `/cash-deposit-occurrences/${encodeURIComponent(id)}/skip`,
        input,
        recurringCashDepositOccurrenceSchema,
      ),
    reopenOccurrence: (
      id: string,
      expectedVersion: number,
    ): Promise<RecurringCashDepositOccurrence> =>
      this.postParsed(
        `/cash-deposit-occurrences/${encodeURIComponent(id)}/reopen`,
        { expectedVersion },
        recurringCashDepositOccurrenceSchema,
      ),
  };

  readonly fundInvestments = {
    getPlans: (
      params: { accountId?: string; status?: 'ACTIVE' | 'PAUSED' | 'ENDED' } = {},
    ): Promise<RecurringFundInvestmentPlan[]> =>
      this.requestParsed(
        `/fund-investment-plans${queryString(params)}`,
        recurringFundInvestmentPlansResponseSchema,
      ),
    createPlan: (input: CreateRecurringFundInvestmentPlan): Promise<RecurringFundInvestmentPlan> =>
      this.postParsed('/fund-investment-plans', input, recurringFundInvestmentPlanSchema),
    updatePlan: (
      id: string,
      input: UpdateRecurringFundInvestmentPlan,
    ): Promise<RecurringFundInvestmentPlan> =>
      this.patchParsed(
        `/fund-investment-plans/${encodeURIComponent(id)}`,
        input,
        recurringFundInvestmentPlanSchema,
      ),
    pausePlan: (id: string, expectedVersion: number): Promise<RecurringFundInvestmentPlan> =>
      this.postParsed(
        `/fund-investment-plans/${encodeURIComponent(id)}/pause`,
        { expectedVersion },
        recurringFundInvestmentPlanSchema,
      ),
    resumePlan: (id: string, expectedVersion: number): Promise<RecurringFundInvestmentPlan> =>
      this.postParsed(
        `/fund-investment-plans/${encodeURIComponent(id)}/resume`,
        { expectedVersion },
        recurringFundInvestmentPlanSchema,
      ),
    endPlan: (id: string, expectedVersion: number): Promise<RecurringFundInvestmentPlan> =>
      this.postParsed(
        `/fund-investment-plans/${encodeURIComponent(id)}/end`,
        { expectedVersion },
        recurringFundInvestmentPlanSchema,
      ),
    getOccurrences: (
      params: {
        accountId?: string;
        planId?: string;
        status?: 'PENDING' | 'CONFIRMED' | 'SKIPPED';
      } = {},
    ): Promise<RecurringFundInvestmentOccurrence[]> =>
      this.requestParsed(
        `/fund-investment-occurrences${queryString(params)}`,
        recurringFundInvestmentOccurrencesResponseSchema,
      ),
    confirmOccurrence: (
      id: string,
      input: ConfirmRecurringFundInvestmentOccurrence,
    ): Promise<RecurringFundInvestmentOccurrence> =>
      this.postParsed(
        `/fund-investment-occurrences/${encodeURIComponent(id)}/confirm`,
        input,
        recurringFundInvestmentOccurrenceSchema,
      ),
    skipOccurrence: (
      id: string,
      input: { expectedVersion: number; reason: string },
    ): Promise<RecurringFundInvestmentOccurrence> =>
      this.postParsed(
        `/fund-investment-occurrences/${encodeURIComponent(id)}/skip`,
        input,
        recurringFundInvestmentOccurrenceSchema,
      ),
    reopenOccurrence: (
      id: string,
      expectedVersion: number,
    ): Promise<RecurringFundInvestmentOccurrence> =>
      this.postParsed(
        `/fund-investment-occurrences/${encodeURIComponent(id)}/reopen`,
        { expectedVersion },
        recurringFundInvestmentOccurrenceSchema,
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
        baseCurrency?: Currency;
      } = {},
    ) =>
      this.requestParsed(
        `/performance/summary${queryString(params)}`,
        performanceSummaryResponseSchema,
      ),
  };

  readonly market = {
    ...marketControlClient(this.requestParsed.bind(this)),
    getPlannedChartOptions: async (
      symbol: string,
      input: MarketChartPlanV3,
      signal?: AbortSignal,
    ) => {
      const plan = marketChartPlanV3Schema.parse(input);
      const path = `/api/market/${encodeURIComponent(symbol)}/chart-options${queryString({
        barsLimit: plan.barsLimit,
        indicatorParams: JSON.stringify(plan.indicatorParams),
        planEnd: plan.end,
      })}`;
      const response = await this.requestParsed(
        path,
        marketChartOptionsV3Schema,
        signal ? { signal } : undefined,
      );
      const actual = response.plan;
      if (
        response.symbol !== symbol ||
        !response.window ||
        !actual ||
        actual.barsLimit !== plan.barsLimit ||
        actual.end !== plan.end ||
        Object.keys(actual.indicatorParams).length !== Object.keys(plan.indicatorParams).length ||
        Object.entries(plan.indicatorParams).some(
          ([key, value]) => actual.indicatorParams[key] !== value,
        )
      ) {
        throw new ThesisLedgerContractError(path);
      }
      return response;
    },
    getChartOptions: async (
      symbol: string,
      signal?: AbortSignal,
      requestedWindow?: MarketChartOptionsWindowV3,
    ) => {
      const window = requestedWindow
        ? marketChartOptionsWindowV3Schema.parse(requestedWindow)
        : undefined;
      const path = `/api/market/${encodeURIComponent(symbol)}/chart-options${queryString(window ?? {})}`;
      const response = await this.requestParsed(
        path,
        marketChartOptionsV3Schema,
        signal ? { signal } : undefined,
      );
      if (
        response.symbol !== symbol ||
        response.window?.start !== window?.start ||
        response.window?.end !== window?.end
      ) {
        throw new ThesisLedgerContractError(path);
      }
      return response;
    },
    searchInstruments: (params: { q: string; limit?: number }) =>
      this.requestParsed(
        `/api/market-data/instruments/search${queryString(params)}`,
        instrumentSearchResponseSchema,
      ),
    getDetail: (symbol: string, params: MarketDetailQuery = {}) => {
      const { signal, refresh, include, indicatorParams, adjustment, ...query } = params;
      return this.requestParsed<MarketDetailResponse>(
        `/api/market/${encodeURIComponent(symbol)}/detail${queryString({
          ...query,
          chartContractVersion: 3,
          ...(adjustment === undefined ? {} : { adjustment }),
          ...(indicatorParams ? { indicatorParams: JSON.stringify(indicatorParams) } : {}),
          ...(refresh ? { refresh: 1 } : {}),
          ...(include ? { include } : {}),
        })}`,
        marketDetailResponseSchema,
        signal ? { signal } : undefined,
      );
    },
  };

  readonly journalReviews = journalReviewClient(
    this.requestParsed.bind(this),
    this.postParsed.bind(this),
    queryString,
  );

  readonly ledger = {
    createCashFlow: (command: CreateCashFlowCommand): Promise<LedgerCommandResponse> =>
      this.postParsed('/ledger/cash-flows', command, ledgerCommandResponseSchema),
    replaceCashFlow: (command: ReplaceCashFlowCommand): Promise<LedgerCommandResponse> =>
      this.postParsed('/ledger/cash-flows/replace', command, ledgerCommandResponseSchema),
    voidCashFlow: (command: VoidCashFlowCommand): Promise<LedgerCommandResponse> =>
      this.postParsed('/ledger/cash-flows/void', command, ledgerCommandResponseSchema),
    restoreCashFlow: (command: RestoreCashFlowCommand): Promise<LedgerCommandResponse> =>
      this.postParsed('/ledger/cash-flows/restore', command, ledgerCommandResponseSchema),
    createCashTransfer: (command: CreateCashTransferCommand): Promise<LedgerCommandResponse> =>
      this.postParsed('/ledger/cash-transfers', command, ledgerCommandResponseSchema),
    replaceCashTransfer: (command: ReplaceCashTransferCommand): Promise<LedgerCommandResponse> =>
      this.postParsed('/ledger/cash-transfers/replace', command, ledgerCommandResponseSchema),
    voidCashTransfer: (command: VoidCashTransferCommand): Promise<LedgerCommandResponse> =>
      this.postParsed('/ledger/cash-transfers/void', command, ledgerCommandResponseSchema),
    restoreCashTransfer: (command: RestoreCashTransferCommand): Promise<LedgerCommandResponse> =>
      this.postParsed('/ledger/cash-transfers/restore', command, ledgerCommandResponseSchema),
    createExecution: (command: CreateExecutionCommand): Promise<LedgerCommandResponse> =>
      this.postParsed('/ledger/executions', command, ledgerCommandResponseSchema),
    replaceExecution: (command: ReplaceExecutionCommand): Promise<LedgerCommandResponse> =>
      this.postParsed('/ledger/executions/replace', command, ledgerCommandResponseSchema),
    voidExecution: (command: VoidExecutionCommand): Promise<LedgerCommandResponse> =>
      this.postParsed('/ledger/executions/void', command, ledgerCommandResponseSchema),
    restoreExecution: (command: RestoreExecutionCommand): Promise<LedgerCommandResponse> =>
      this.postParsed('/ledger/executions/restore', command, ledgerCommandResponseSchema),
    moveExecutionAccount: (command: MoveExecutionAccountCommand): Promise<LedgerCommandResponse> =>
      this.postParsed('/ledger/executions/move-account', command, ledgerCommandResponseSchema),
    createBaselineObservationBatch: (
      command: CreateBaselineObservationBatchCommand,
    ): Promise<LedgerCommandResponse> =>
      this.postParsed('/ledger/baseline-observation-batches', command, ledgerCommandResponseSchema),
    createImportDraftRevision: (
      command: CreateImportDraftRevisionCommand,
    ): Promise<ImportDraftCommandResponse> =>
      this.postParsed('/ledger/import-draft-revisions', command, importDraftCommandResponseSchema),
    reviseImportDraft: (command: ReviseImportDraftCommand): Promise<ImportDraftRevisionResponse> =>
      this.postParsed(
        '/ledger/import-draft-revisions/revise',
        command,
        importDraftRevisionResponseSchema,
      ),
    submitImportDraftRevision: (
      command: SubmitImportDraftRevisionCommand,
    ): Promise<LedgerCommandResponse> =>
      this.postParsed(
        '/ledger/import-draft-revisions/submit',
        command,
        ledgerCommandResponseSchema,
      ),
    getEvents: (
      accountId: string,
      params: { asOfRevision?: string } = {},
    ): Promise<LedgerEventsResponse> =>
      this.requestParsed(
        `/ledger/${encodeURIComponent(accountId)}/events${queryString(params)}`,
        ledgerEventsResponseSchema,
      ),
    getEventAudit: (
      accountId: string,
      params: { asOfRevision?: string } = {},
    ): Promise<LedgerAuditResponse> =>
      this.requestParsed(
        `/ledger/${encodeURIComponent(accountId)}/events/audit${queryString(params)}`,
        ledgerAuditResponseSchema,
      ),
    replayEvents: (accountId: string, asOfRevision: string): Promise<LedgerReplayResponse> =>
      this.requestParsed(
        `/ledger/${encodeURIComponent(accountId)}/events/replay${queryString({ asOfRevision })}`,
        ledgerReplayResponseSchema,
      ),
    getReconciliationCandidates: (
      accountId: string,
    ): Promise<BaselineReconciliationCandidatesResponse> =>
      this.requestParsed(
        `/ledger/${encodeURIComponent(accountId)}/reconciliation-candidates`,
        baselineReconciliationCandidatesResponseSchema,
      ),
    confirmBaselineReconciliation: (
      command: ConfirmBaselineReconciliationCommand,
    ): Promise<LedgerCommandResponse> =>
      this.postParsed('/ledger/reconciliations/confirm', command, ledgerCommandResponseSchema),
    voidBaselineReconciliation: (
      command: VoidBaselineReconciliationCommand,
    ): Promise<LedgerCommandResponse> =>
      this.postParsed('/ledger/reconciliations/void', command, ledgerCommandResponseSchema),
    restoreBaselineReconciliation: (
      command: RestoreBaselineReconciliationCommand,
    ): Promise<LedgerCommandResponse> =>
      this.postParsed('/ledger/reconciliations/restore', command, ledgerCommandResponseSchema),
  };

  readonly backtests = {
    ...backtestNavRunClient(this.requestParsed.bind(this), this.postParsed.bind(this)),
    ...backtestRunConfigClient(this.postParsed.bind(this)),
    ...backtestRunClient(this.requestParsed.bind(this), this.postParsed.bind(this)),
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

  private patchParsed<T>(
    path: string,
    body: unknown,
    schema: { safeParse(value: unknown): { success: true; data: T } | { success: false } },
  ): Promise<T> {
    return this.requestParsed(path, schema, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  }

  private async deleteNoContent(path: string): Promise<void> {
    const response = await this.fetchResponse(path, { method: 'DELETE' });
    if (response.status !== 204) throw new ThesisLedgerContractError(path);
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
    const url = path.startsWith('/api/')
      ? new URL(path, new URL(this.baseUrl).origin)
      : new URL(path.replace(/^\/+/, ''), this.baseUrl);
    const response = await this.fetcher(url, requestInit);
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
