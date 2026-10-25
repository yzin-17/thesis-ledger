import { cashManagementClient } from './cash-management-client.js';
import { aiProviderClient } from './ai-provider-client.js';
import { marketPolicyClient } from './market-policy-client.js';
import { marketCatalogClient } from './market-catalog-client.js';
export { marketPolicyClient } from './market-policy-client.js';
export { marketCatalogClient } from './market-catalog-client.js';
import { providerOAuthClient } from './provider-oauth-client.js';
import { automationClient } from './automation-client.js';
import { diagnosticsClient } from './diagnostics-client.js';
export { automationClient } from './automation-client.js';
export { diagnosticsClient } from './diagnostics-client.js';
export { safeProviderOAuthUrl } from './provider-oauth-client.js';
export { aiProviderClient } from './ai-provider-client.js';
import { performanceClient } from './performance-client.js';
import { riskManagementClient } from './risk-management-client.js';
import { marketInformationClient } from './market-information-client.js';
export { marketInformationClient } from './market-information-client.js';
export {
  requestPlannedMarketDetail,
  readPlannedMarketDetail,
  MarketChartUnavailableError,
} from './planned-market-detail.js';
export { riskManagementClient } from './risk-management-client.js';
export { performanceClient } from './performance-client.js';
import { marketChartOptionsClient } from './market-chart-options-client.js';
import { ThesisLedgerContractError } from './api-error.js';
import { marketDisplayClient } from './market-display-client.js';
import { backtestClients } from './backtest-clients.js';
import { strategyClients } from './strategy-clients.js';
import { marketControlClient } from './market-control-client.js';
import { journalReviewClient } from './journal-review-client.js';
import { researchClient } from './research-client.js';
import { researchRunClient } from './research-run-client.js';
export { researchRunClient } from './research-run-client.js';
export { strategyClients } from './strategy-clients.js';
export { backtestClients } from './backtest-clients.js';
import {
  apiErrorResponseSchema,
  baselineReconciliationCandidatesResponseSchema,
  importDraftCommandResponseSchema,
  importDraftRevisionResponseSchema,
  ledgerCommandResponseSchema,
  ledgerAuditResponseSchema,
  ledgerEventsResponseSchema,
  ledgerReplayResponseSchema,
  portfolioValuationResponseSchema,
  tradeCloseSliceQueryResponseSchema,
  tradeDetailResponseSchema,
  tradeListResponseSchema,
  tradeReferenceResolveResponseSchema,
  type ApiErrorResponse,
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
  MarketDisplayDetailResponse,
  MarketDisplayDetailSection,
  MarketPeriodOptions,
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

export type {
  MarketDetailQuery,
  MarketChartQuery,
  MarketPeriodOptionsQuery,
} from './market-display-client.js';

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

import { ThesisLedgerApiError, retryAfterMilliseconds } from './api-error.js';
import { accountManagementClient } from './account-management-client.js';
import { ledgerImportClient } from './ledger-import-client.js';
import { instrumentClient } from './instrument-client.js';
import { positionManagementClient } from './position-management-client.js';
export type { SaveAccountInput } from './account-management-client.js';
export { draftIsFrozen, rowCanSubmit, reviewedDraftCommand } from './import-review-policy.js';
export { ThesisLedgerApiError, retryAfterMilliseconds } from './api-error.js';

export { ThesisLedgerContractError } from './api-error.js';

export class ThesisLedgerApiClient {
  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch;

  readonly accounts = accountManagementClient(
    this.requestParsed.bind(this),
    this.fetchResponse.bind(this),
  );
  readonly imports = ledgerImportClient(this.requestParsed.bind(this));
  readonly positionManagement = positionManagementClient(this.fetchResponse.bind(this));

  readonly portfolio = {
    getValuation: (
      params: {
        mode?: 'actual' | 'shadow';
        accountId?: string;
        fxMerge?: boolean;
        baseCurrency?: Currency;
        t?: number;
      } = {},
      signal?: AbortSignal,
    ) =>
      this.requestParsed(
        `/portfolio/valuation${queryString(params)}`,
        portfolioValuationResponseSchema,
        signal ? { signal } : undefined,
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

  private readonly cashManagement = cashManagementClient(this.requestParsed.bind(this));
  readonly cash = this.cashManagement.cash;
  readonly cashDeposits = this.cashManagement.cashDeposits;
  readonly fundInvestments = this.cashManagement.fundInvestments;

  readonly risk = riskManagementClient(this.requestParsed.bind(this));

  readonly performance = performanceClient(this.requestParsed.bind(this));

  readonly market = {
    ...marketPolicyClient(this.requestParsed.bind(this)),
    ...marketCatalogClient(this.requestParsed.bind(this)),
    ...marketControlClient(this.requestParsed.bind(this)),
    ...marketDisplayClient(this.requestParsed.bind(this), queryString),
    ...marketChartOptionsClient(this.requestParsed.bind(this), queryString),
    ...marketInformationClient(this.requestParsed.bind(this)),
    ...instrumentClient(this.requestParsed.bind(this), this.fetchResponse.bind(this)),
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

  readonly research = researchClient(this.requestParsed.bind(this));
  readonly aiProviders = aiProviderClient(this.requestParsed.bind(this));
  readonly providerOAuth = providerOAuthClient(this.requestParsed.bind(this));
  readonly automations = automationClient(this.requestParsed.bind(this));
  readonly diagnostics = diagnosticsClient(this.requestParsed.bind(this));
  readonly researchRuns = researchRunClient(this.requestParsed.bind(this));

  readonly strategy = strategyClients(this.requestParsed.bind(this));
  readonly backtests = backtestClients(this.requestParsed.bind(this));

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

  async fetchResponse(path: string, init?: RequestInit) {
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
    throw new ThesisLedgerApiError(
      response.status,
      payload,
      retryAfterMilliseconds(response.headers.get('retry-after')),
    );
  }
}
