import { Injectable } from '@nestjs/common';
import { DsaDataCapabilityReaderV3 } from './dsa-data-capability-reader-v3.js';
import type {
  DesiredProviderPolicyV3,
  MarketProviderTestOptions,
  MarketRouteCatalogV3,
  MarketControlHandshakeResponseV3,
  MarketControlPolicyApplyResponseV3,
  MarketDataBarSeriesRequestV3,
  MarketEventRequestV3,
  MarketEventResponseV3,
  MarketNewsRequestV3,
  MarketNewsResponseV3,
  MarketCacheContextRequestV3,
  MarketCacheContextResponseV3,
  MarketPublicFeesRequestV3,
  MarketPublicFeesResponseV3,
  MarketTradingStatusRequestV3,
  MarketTradingStatusResponseV3,
  MarketChartBarsRequestV3,
  MarketChartBarsResponseV3,
  MarketDataBarSeriesResponseV3,
  MarketDataContractCapabilitiesV3,
  BarSeries,
  IndicatorCalculateResponse,
  ProviderOAuthAction,
  Currency,
  FxRatesResponse,
  BacktestCalendarResponse,
  BacktestInstrumentFactsResponse,
  BacktestInstrumentFactsRequest,
  BacktestMarket,
} from '@thesis-ledger/schemas';
import {
  backtestCalendarResponseSchema,
  backtestInstrumentFactsResponseSchema,
  backtestInstrumentFactsRequestSchema,
  fxRatesResponseSchema,
  marketControlHandshakeRequestV3Schema,
  marketControlPolicyApplyRequestV3Schema,
  marketRouteCatalogGetEndpointV3,
  indicatorCalculateRequestSchema,
  marketPeriodIndicatorRequestSchema,
  marketPeriodIndicatorCapabilitiesSchema,
  type MarketPeriodIndicatorRequest,
  type MarketPeriodIndicatorCapabilities,
  indicatorCalculateResponseSchema,
  marketNewsRequestV3Schema,
} from '@thesis-ledger/schemas';
import {
  mapControlV3HttpError,
  mapDataV3HttpError,
  parseControlHandshakeResponseV3,
  parseControlPolicyApplyResponseV3,
  parseDataCapabilitiesV3,
  parseEffectivePolicyEnvelopeV3,
  parseMarketRouteCatalogV3,
  type EffectivePolicyEnvelopeV3,
} from './dsa-v3-protocol.js';
import { loadConfig } from '../../platform/config.js';
import {
  parseProviderRegistry,
  parseProviderMutation,
  parseProviderOAuth,
} from './dsa-provider-v3.js';

export const DSA_MARKET_INDICATOR_ENGINE_VERSION = 'dsa-indicator-v3';
import {
  parseCatalogJob,
  parseCatalogAck,
  parseCatalogSnapshot,
  parseCatalogDelta,
} from './dsa-catalog-v3.js';
import { currentTraceId } from '../../platform/structured-logger.js';
import { fetchObservedCacheRequest } from './dsa-cache-request-observation.js';
import {
  DsaError,
  controlErrorCode,
  toDsaError,
  parseV3Response,
  type HttpErrorMapper,
} from './dsa-client-errors.js';

export type { CatalogJob } from './dsa-catalog-v3.js';
export { DsaError } from './dsa-client-errors.js';

const requestSignal = (timeoutMs: number, signal?: AbortSignal) => signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs);

@Injectable()
export class DsaClient {
  private readonly config = loadConfig();
  get dataCapabilities() {
    return new DsaDataCapabilityReaderV3(
      (path, request, mapper, budgetMs, signal) => this.post<unknown>(path, request, 1, mapper, budgetMs, signal),
      parseV3Response,
      () => this.marketDataCapabilitiesV3(),
      () => this.effectiveControlPolicyV3().then(result => result.projection?.effective ?? null),
    );
  }
  /** Read-only budget used by callers to derive bounded distributed leases. */
  get timeoutMs() {
    return this.config.dsaTimeoutMs;
  }

  async get<T>(path: string, attempts = 2, mapHttpError?: HttpErrorMapper, signal?: AbortSignal): Promise<T> {
    let lastError: unknown;
    const traceId = currentTraceId() ?? crypto.randomUUID();
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        const response = await fetchObservedCacheRequest(new URL(path, this.config.dsaBaseUrl), {
          signal: requestSignal(this.config.dsaTimeoutMs, signal),
          headers: {
            authorization: `Bearer ${this.config.dsaToken}`,
            'x-trace-id': traceId,
            'x-request-id': traceId,
          },
        }, traceId, attempt + 1);
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as {
            detail?: { code?: string; message?: string };
          } | null;
          if (mapHttpError) throw toDsaError(mapHttpError(response.status, payload));
          const detail = payload?.detail;
          const code =
            detail?.code === 'unauthorized'
              ? 'unauthorized'
              : detail?.code === 'unsupported_capability'
                ? 'unsupported-capability'
                : 'unavailable';
          throw new DsaError(
            detail?.message ?? `DSA 返回 ${response.status}`,
            code,
            response.status,
          );
        }
        try {
          return (await response.json()) as T;
        } catch {
          if (mapHttpError) throw new DsaError('DSA V3 响应不是有效 JSON', 'invalid-response');
          throw new Error('DSA 响应不是有效 JSON');
        }
      } catch (error) {
        lastError = error;
        if (attempt + 1 < attempts)
          await new Promise((resolve) => setTimeout(resolve, 100 * 2 ** attempt));
      }
    }
    if (lastError instanceof DsaError) throw lastError;
    if (lastError instanceof DOMException && lastError.name === 'TimeoutError')
      throw new DsaError('DSA 请求超时', 'timeout');
    throw new DsaError('DSA 不可用', 'unavailable');
  }

  async post<T>(
    path: string,
    body: unknown,
    attempts = 2,
    mapHttpError?: HttpErrorMapper,
    timeoutMs = this.config.dsaTimeoutMs,
    signal?: AbortSignal,
  ): Promise<T> {
    let lastError: unknown;
    const traceId = currentTraceId() ?? crypto.randomUUID();
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        const response = await fetchObservedCacheRequest(new URL(path, this.config.dsaBaseUrl), {
          method: 'POST',
          signal: requestSignal(Math.min(timeoutMs, this.config.dsaTimeoutMs), signal),
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${this.config.dsaToken}`,
            'x-trace-id': traceId,
            'x-request-id': traceId,
          },
          body: JSON.stringify(body),
        }, traceId, attempt + 1);
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as {
            detail?: { code?: string; message?: string };
          } | null;
          if (mapHttpError) throw toDsaError(mapHttpError(response.status, payload));
          throw new DsaError(
            payload?.detail?.message ?? `DSA 返回 ${response.status}`,
            'unavailable',
            response.status,
          );
        }
        try {
          return (await response.json()) as T;
        } catch {
          if (mapHttpError) throw new DsaError('DSA V3 响应不是有效 JSON', 'invalid-response');
          throw new Error('DSA 响应不是有效 JSON');
        }
      } catch (error) {
        lastError = error;
        if (attempt + 1 < attempts)
          await new Promise((resolve) => setTimeout(resolve, 100 * 2 ** attempt));
      }
    }
    if (lastError instanceof DsaError) throw lastError;
    if (lastError instanceof DOMException && lastError.name === 'TimeoutError')
      throw new DsaError('DSA 请求超时', 'timeout');
    throw new DsaError('DSA 不可用', 'unavailable');
  }

  async control<T>(
    path: string,
    init?: RequestInit,
    attempts = 1,
    mapHttpError?: HttpErrorMapper,
    timeoutMs = this.config.dsaTimeoutMs,
  ): Promise<T> {
    if (!this.config.controlToken) throw new DsaError('Control Token 未配置', 'unavailable');
    let lastError: unknown;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        const response = await fetch(new URL(path, this.config.dsaBaseUrl), {
          ...init,
          signal: AbortSignal.timeout(timeoutMs),
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${this.config.controlToken}`,
            'x-request-id': currentTraceId() ?? crypto.randomUUID(),
            ...init?.headers,
          },
        });
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as {
            detail?: { code?: string; message?: string };
          } | null;
          if (mapHttpError) throw toDsaError(mapHttpError(response.status, body));
          const detail = body?.detail;
          throw new DsaError(
            detail?.message ?? `DSA Control 返回 ${response.status}`,
            controlErrorCode(detail?.code, response.status),
            response.status,
          );
        }
        try {
          return (await response.json()) as T;
        } catch {
          if (mapHttpError) throw new DsaError('DSA V3 响应不是有效 JSON', 'invalid-response');
          throw new Error('DSA Control 响应不是有效 JSON');
        }
      } catch (error) {
        lastError = error;
        if (attempt + 1 < attempts)
          await new Promise((resolve) => setTimeout(resolve, 100 * 2 ** attempt));
      }
    }
    if (lastError instanceof DsaError) throw lastError;
    if (lastError instanceof DOMException && lastError.name === 'TimeoutError')
      throw new DsaError('DSA Control 请求超时', 'timeout');
    throw new DsaError('DSA Control 不可用', 'unavailable');
  }

  health() {
    return this.get<unknown>('/health', 1);
  }

  backtestCalendar(input: {
    market: BacktestMarket;
    start: string;
    end: string;
    dataAsOf: string;
  }): Promise<BacktestCalendarResponse> {
    const params = new URLSearchParams(input);
    return this.get<unknown>(
      `/api/v3/thesis-ledger/backtest/calendar?${params.toString()}`,
      1,
    ).then((raw) => backtestCalendarResponseSchema.parse(raw));
  }

  marketCalendar(input: {
    market: BacktestMarket;
    start: string;
    end: string;
    dataAsOf: string;
  }): Promise<BacktestCalendarResponse> {
    const params = new URLSearchParams(input);
    return this.get<unknown>(`/api/v3/thesis-ledger/market/calendar?${params.toString()}`, 1).then(
      (raw) => backtestCalendarResponseSchema.parse(raw),
    );
  }

  backtestInstrumentFacts(
    input: BacktestInstrumentFactsRequest,
  ): Promise<BacktestInstrumentFactsResponse> {
    const checked = backtestInstrumentFactsRequestSchema.parse(input);
    const params = new URLSearchParams(
      Object.entries(checked)
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => [key, String(value)]),
    );
    return this.get<unknown>(
      `/api/v3/thesis-ledger/backtest/instrument-facts?${params.toString()}`,
      1,
    ).then((raw) => backtestInstrumentFactsResponseSchema.parse(raw));
  }

  marketDataCapabilitiesV3(): Promise<MarketDataContractCapabilitiesV3> {
    return this.get<unknown>('/api/v3/thesis-ledger/capabilities', 1, (status, payload) =>
      mapDataV3HttpError(status, payload),
    ).then((raw) => parseV3Response(() => parseDataCapabilitiesV3(raw)));
  }

  /** 精确路由目录通过独立 Control GET 传输；partial 目录不会暴露可应用行。 */
  marketRouteCatalogV3(): Promise<MarketRouteCatalogV3> {
    return this.control<unknown>(marketRouteCatalogGetEndpointV3, undefined, 1, (status, payload) =>
      mapControlV3HttpError(status, payload),
    ).then((raw) => parseV3Response(() => parseMarketRouteCatalogV3(raw)));
  }

  /** 选择器读取时将选中的 target 与 routeIndex 放入 request.routeTarget，以固定并核对来源。 */
  marketBarsV3(input: MarketDataBarSeriesRequestV3): Promise<MarketDataBarSeriesResponseV3> {
    return this.dataCapabilities.bars(input);
  }

  marketChartBarsV3(input: MarketChartBarsRequestV3): Promise<MarketChartBarsResponseV3> {
    return this.dataCapabilities.chartBars(input);
  }

  marketEventsV3(input: MarketEventRequestV3): Promise<MarketEventResponseV3> {
    return this.dataCapabilities.events(input);
  }

  marketNewsV3(input: MarketNewsRequestV3, signal?: AbortSignal): Promise<MarketNewsResponseV3> {
    const request = marketNewsRequestV3Schema.parse(input);
    return this.dataCapabilities.news({
      ...request,
      requestBudgetMs: Math.min(request.requestBudgetMs, this.timeoutMs),
    }, signal);
  }

  marketCacheContextV3(input: MarketCacheContextRequestV3, signal?: AbortSignal): Promise<MarketCacheContextResponseV3> {
    return this.dataCapabilities.cacheContext(input, signal);
  }

  marketPublicFeesV3(input: MarketPublicFeesRequestV3): Promise<MarketPublicFeesResponseV3> {
    return this.dataCapabilities.publicFees(input);
  }

  marketTradingStatusV3(
    input: MarketTradingStatusRequestV3,
  ): Promise<MarketTradingStatusResponseV3> {
    return this.dataCapabilities.tradingStatus(input);
  }

  calculateIndicators(input: {
    identity: BarSeries['identity'];
    inputFingerprint: string;
    points: BarSeries['points'];
    requests: Array<{ name: 'MA' | 'MACD' | 'RSI'; parameters: Record<string, number> }>;
  }): Promise<IndicatorCalculateResponse> {
    const request = indicatorCalculateRequestSchema.parse({ contractVersion: 3, ...input });
    return this.post<unknown>('/api/v3/thesis-ledger/market/indicators/calculate', request, 1).then(
      (raw) => indicatorCalculateResponseSchema.parse(raw),
    );
  }

  marketPeriodIndicatorCapabilities(): Promise<MarketPeriodIndicatorCapabilities> {
    return this.get<unknown>('/api/v3/thesis-ledger/market/indicators/capabilities', 1).then(
      (raw) => marketPeriodIndicatorCapabilitiesSchema.parse(raw),
    );
  }

  calculatePeriodIndicators(
    input: Omit<MarketPeriodIndicatorRequest, 'contractVersion'>,
  ): Promise<IndicatorCalculateResponse> {
    const request = marketPeriodIndicatorRequestSchema.parse({ ...input, contractVersion: 3 });
    return this.post<unknown>('/api/v3/thesis-ledger/market/indicators/calculate', request, 1).then(
      (raw) =>
        indicatorCalculateResponseSchema
          .refine(
            (value) =>
              value.engineVersion === DSA_MARKET_INDICATOR_ENGINE_VERSION &&
              value.inputFingerprint === request.inputFingerprint &&
              value.results.every((result) => result.inputFingerprint === request.inputFingerprint),
          )
          .parse(raw),
    );
  }

  fxRates(input: {
    baseCurrency: Currency;
    currencies: readonly Currency[];
    asOf?: string;
  }): Promise<FxRatesResponse> {
    const params = new URLSearchParams({
      baseCurrency: input.baseCurrency,
      currencies: [...new Set(input.currencies)].join(','),
    });
    if (input.asOf) params.set('asOf', input.asOf.slice(0, 10));
    return this.get<unknown>(`/api/v3/thesis-ledger/market/fx-rates?${params.toString()}`).then(
      (raw) => fxRatesResponseSchema.parse(raw),
    );
  }

  controlHandshakeV3(
    requestId: string = crypto.randomUUID(),
  ): Promise<MarketControlHandshakeResponseV3> {
    const request = marketControlHandshakeRequestV3Schema.parse({
      contractVersion: 3,
      consumer: 'thesis-ledger',
      requestId,
      supportedVersions: [3],
    });
    return this.control<unknown>(
      '/api/v3/thesis-ledger/control/handshake',
      {
        method: 'POST',
        headers: { 'x-request-id': request.requestId },
        body: JSON.stringify(request),
      },
      1,
      (status, payload) => mapControlV3HttpError(status, payload, request.requestId),
    ).then((raw) => parseV3Response(() => parseControlHandshakeResponseV3(raw, request.requestId)));
  }

  controlProviders() {
    return this.control<unknown>('/api/v3/thesis-ledger/control/providers').then(
      parseProviderRegistry,
    );
  }

  async longbridgeOAuth(action: ProviderOAuthAction) {
    let path = '/api/v3/thesis-ledger/control/providers/longbridge/oauth/sessions';
    let init: RequestInit = {};
    if (action.kind === 'create') {
      init = {
        method: 'POST',
        body: JSON.stringify({
          contractVersion: 3,
          consumer: 'thesis-ledger',
          requestId: crypto.randomUUID(),
          clientId: action.clientId,
        }),
      };
    } else if (action.kind === 'current') {
      path += '/current';
    } else {
      path += `/${encodeURIComponent(action.sessionId)}`;
      if (action.kind === 'cancel') {
        path += '/cancel';
        init = {
          method: 'POST',
          body: JSON.stringify({
            contractVersion: 3,
            consumer: 'thesis-ledger',
            requestId: crypto.randomUUID(),
          }),
        };
      }
    }
    const raw = await this.control<unknown>(path, init);
    return parseProviderOAuth(raw, action);
  }

  saveControlProvider(
    providerId: string,
    input: {
      requestId?: string;
      enabled?: boolean;
      expectedConfigVersion?: number;
      credentials?: { method: string; values: Record<string, unknown> };
      clearCredentials?: boolean;
      settings?: Record<string, unknown>;
    },
  ) {
    const requestId = input.requestId ?? crypto.randomUUID();
    return this.control<unknown>(
      `/api/v3/thesis-ledger/control/providers/${encodeURIComponent(providerId)}/config`,
      {
        method: 'POST',
        body: JSON.stringify({
          ...input,
          contractVersion: 3,
          consumer: 'thesis-ledger',
          requestId,
        }),
      },
    ).then((raw) => parseProviderMutation('config', raw, providerId, requestId));
  }

  testControlProvider(
    providerId: string,
    input: MarketProviderTestOptions = {},
  ) {
    const requestId = input.requestId ?? crypto.randomUUID();
    const budget: [] | [number, undefined, number] = input.purpose === 'account_access' ? [1, undefined, 22_000] : [];
    return this.control<unknown>(
      `/api/v3/thesis-ledger/control/providers/${encodeURIComponent(providerId)}/test`,
      {
        method: 'POST',
        body: JSON.stringify({
          ...input,
          contractVersion: 3,
          consumer: 'thesis-ledger',
          requestId,
        }),
      },
      ...budget,
    ).then((raw) => parseProviderMutation('test', raw, providerId, requestId, input.purpose));
  }

  removeControlProvider(providerId: string, input: { requestId?: string; reason?: string } = {}) {
    const requestId = input.requestId ?? crypto.randomUUID();
    return this.control<unknown>(
      `/api/v3/thesis-ledger/control/providers/${encodeURIComponent(providerId)}/remove`,
      {
        method: 'POST',
        body: JSON.stringify({
          contractVersion: 3,
          consumer: 'thesis-ledger',
          requestId,
          reason: input.reason ?? 'removed_by_consumer',
        }),
      },
    ).then((raw) => parseProviderMutation('remove', raw, providerId, requestId));
  }

  applyControlPolicyV3(
    policy: DesiredProviderPolicyV3,
  ): Promise<MarketControlPolicyApplyResponseV3> {
    const request = marketControlPolicyApplyRequestV3Schema.parse(policy);
    return this.control<unknown>(
      '/api/v3/thesis-ledger/control/policies/apply',
      {
        method: 'POST',
        headers: { 'x-request-id': request.requestId },
        body: JSON.stringify(request),
      },
      1,
      (status, payload) => mapControlV3HttpError(status, payload, request.requestId),
    ).then((raw) => parseV3Response(() => parseControlPolicyApplyResponseV3(raw, request)));
  }

  effectiveControlPolicyV3(): Promise<EffectivePolicyEnvelopeV3> {
    return this.control<unknown>(
      '/api/v3/thesis-ledger/control/policies/effective?contractVersion=3',
      undefined,
      1,
      (status, payload) => mapControlV3HttpError(status, payload),
    ).then((raw) => parseV3Response(() => parseEffectivePolicyEnvelopeV3(raw)));
  }

  triggerCatalogJob(requestId = crypto.randomUUID()) {
    return this.control<unknown>('/api/v3/thesis-ledger/control/catalog/jobs', {
      method: 'POST',
      body: JSON.stringify({
        contractVersion: 3,
        consumer: 'thesis-ledger',
        requestId,
      }),
    }).then((raw) => parseCatalogJob(raw, { requestId }));
  }

  catalogJob(jobId: string) {
    return this.control<unknown>(
      `/api/v3/thesis-ledger/control/catalog/jobs/${encodeURIComponent(jobId)}`,
    ).then((raw) => parseCatalogJob(raw, { id: jobId }));
  }

  acknowledgeCatalog(generation: number, checksum: string, requestId = crypto.randomUUID()) {
    return this.control('/api/v3/thesis-ledger/control/catalog/ack', {
      method: 'POST',
      body: JSON.stringify({
        contractVersion: 3,
        consumer: 'thesis-ledger',
        requestId,
        generation,
        checksum,
      }),
    }).then((raw) => parseCatalogAck(raw, generation, checksum, requestId));
  }

  catalogSnapshot(cursor?: string) {
    const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
    return this.get<unknown>(`/api/v3/thesis-ledger/catalog/snapshot${query}`, 1).then(
      parseCatalogSnapshot,
    );
  }

  catalogDelta(cursor: string) {
    return this.get<unknown>(
      `/api/v3/thesis-ledger/catalog/delta?cursor=${encodeURIComponent(cursor)}`,
      1,
    ).then((raw) => parseCatalogDelta(raw, cursor));
  }
}
