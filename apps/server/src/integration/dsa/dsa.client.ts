import { Injectable } from '@nestjs/common';
import { mapEventV3HttpError, parseEventResponseV3 } from './dsa-events-v3.js';
import type {
  DesiredProviderPolicyV3,
  MarketRouteCatalogV3,
  MarketControlHandshakeResponseV3,
  MarketControlPolicyApplyResponseV3,
  MarketDataBarSeriesRequestV3,
  MarketEventRequestV3,
  MarketEventResponseV3,
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
  marketEventRequestV3Schema,
  marketChartBarsRequestV3Schema,
  indicatorCalculateRequestSchema,
  indicatorCalculateResponseSchema,
} from '@thesis-ledger/schemas';
import {
  DsaV3ProtocolError,
  mapControlV3HttpError,
  mapDataV3HttpError,
  parseChartBarsResponseV3,
  parseControlHandshakeResponseV3,
  parseControlPolicyApplyResponseV3,
  parseDataCapabilitiesV3,
  parseEffectivePolicyEnvelopeV3,
  parseMarketRouteCatalogV3,
  type DsaV3ErrorCode,
  type EffectivePolicyEnvelopeV3,
} from './dsa-v3-protocol.js';
import { loadConfig } from '../../platform/config.js';
import { readBarSeriesV3 } from './dsa-market-bars-v3.js';
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

function controlErrorCode(detailCode: string | undefined, status: number): DsaV3ErrorCode {
  if (detailCode === 'unauthorized') return 'unauthorized';
  if (detailCode === 'unsupported_capability') return 'unsupported-capability';
  if (detailCode === 'STALE_REVISION') return 'stale-revision';
  if (status === 409 || status === 422) return 'control-rejected';
  return 'unavailable';
}

export type { CatalogJob } from './dsa-catalog-v3.js';

export class DsaError extends Error {
  constructor(
    message: string,
    readonly code: DsaV3ErrorCode,
    readonly status?: number,
  ) {
    super(message);
  }
}

type HttpErrorMapper = (status: number, payload: unknown) => DsaV3ProtocolError;

const toDsaError = (error: DsaV3ProtocolError) =>
  new DsaError(error.message, error.code, error.status);

const parseV3Response = <T>(parse: () => T): T => {
  try {
    return parse();
  } catch (error) {
    if (error instanceof DsaV3ProtocolError) throw toDsaError(error);
    throw error;
  }
};

@Injectable()
export class DsaClient {
  private readonly config = loadConfig();

  /** Read-only budget used by callers to derive bounded distributed leases. */
  get timeoutMs() {
    return this.config.dsaTimeoutMs;
  }

  async get<T>(path: string, attempts = 2, mapHttpError?: HttpErrorMapper): Promise<T> {
    let lastError: unknown;
    const traceId = currentTraceId() ?? crypto.randomUUID();
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        const response = await fetch(new URL(path, this.config.dsaBaseUrl), {
          signal: AbortSignal.timeout(this.config.dsaTimeoutMs),
          headers: {
            authorization: `Bearer ${this.config.dsaToken}`,
            'x-trace-id': traceId,
            'x-request-id': traceId,
          },
        });
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
  ): Promise<T> {
    let lastError: unknown;
    const traceId = currentTraceId() ?? crypto.randomUUID();
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        const response = await fetch(new URL(path, this.config.dsaBaseUrl), {
          method: 'POST',
          signal: AbortSignal.timeout(this.config.dsaTimeoutMs),
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${this.config.dsaToken}`,
            'x-trace-id': traceId,
            'x-request-id': traceId,
          },
          body: JSON.stringify(body),
        });
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
  ): Promise<T> {
    if (!this.config.controlToken) throw new DsaError('Control Token 未配置', 'unavailable');
    let lastError: unknown;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        const response = await fetch(new URL(path, this.config.dsaBaseUrl), {
          ...init,
          signal: AbortSignal.timeout(this.config.dsaTimeoutMs),
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
    return readBarSeriesV3(
      input,
      (request) =>
        this.post<unknown>('/api/v3/thesis-ledger/market/bars', request, 1, (status, payload) =>
          mapDataV3HttpError(status, payload, request.requestId),
        ),
      () => this.marketDataCapabilitiesV3(),
    ).then(parseV3Response);
  }

  marketChartBarsV3(input: MarketChartBarsRequestV3): Promise<MarketChartBarsResponseV3> {
    const request = marketChartBarsRequestV3Schema.parse(input);
    return this.post<unknown>(
      '/api/v3/thesis-ledger/market/chart-bars',
      request,
      1,
      (status, payload) => mapDataV3HttpError(status, payload, request.requestId),
    ).then((raw) => parseV3Response(() => parseChartBarsResponseV3(raw, request)));
  }

  marketEventsV3(input: MarketEventRequestV3): Promise<MarketEventResponseV3> {
    const request = marketEventRequestV3Schema.parse(input);
    return this.post<unknown>(
      '/api/v3/thesis-ledger/market/events',
      request,
      1,
      (status, payload) => mapEventV3HttpError(status, payload, request.requestId),
    ).then((raw) => parseV3Response(() => parseEventResponseV3(raw, request)));
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
    input: {
      requestId?: string;
      credentials?: { method: string; values: Record<string, unknown> };
    } = {},
  ) {
    const requestId = input.requestId ?? crypto.randomUUID();
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
    ).then((raw) => parseProviderMutation('test', raw, providerId, requestId));
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
