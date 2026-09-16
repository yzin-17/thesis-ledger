import { Injectable } from '@nestjs/common';
import type {
  CatalogSnapshot,
  CatalogDelta,
  DesiredProviderPolicy,
  ProviderManifest,
  DesiredProviderPolicyV2,
  EffectiveProviderPolicyV2,
  BarSeriesV2,
  IndicatorCalculateResponseV2,
  ProviderOAuthAction,
  CurrencyV1,
  FxRatesResponseV1,
  BacktestCapabilities,
  BacktestDailyBar,
  BacktestMinuteBar,
  BacktestCalendarResponse,
  BacktestCorporateActionsResponse,
  BacktestInstrumentFactsResponse,
  BacktestInstrumentFactsRequest,
  BacktestInstrumentType,
  BacktestMarket,
} from '@thesis-ledger/schemas';
import {
  backtestCalendarResponseSchema,
  backtestDailyBarSchema,
  backtestCapabilitiesSchema,
  backtestCorporateActionsResponseSchema,
  backtestInstrumentFactsResponseSchema,
  backtestInstrumentFactsRequestSchema,
  backtestMinuteBarSchema,
  fxRatesResponseSchemaV1,
  providerOAuthSessionSchema,
  currentProviderOAuthSessionSchema,
  desiredProviderPolicyV2Schema,
  effectiveProviderPolicyV2Schema,
  barSeriesV2Schema,
  indicatorCalculateResponseV2Schema,
} from '@thesis-ledger/schemas';
import { loadConfig } from '../../platform/config.js';

export const DSA_MARKET_INDICATOR_ENGINE_VERSION = 'dsa-indicator-v2';
import { currentTraceId } from '../../platform/structured-logger.js';

export type CatalogJob = {
  id: string;
  status: 'pending' | 'running' | 'succeeded' | 'failed' | 'timeout';
  generation: number;
  checksum: string;
  error?: unknown;
  owner?: string | null;
  leaseExpiresAt?: string | null;
  leaseValid?: boolean;
  retryable?: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export class DsaError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'timeout'
      | 'unavailable'
      | 'invalid-response'
      | 'unauthorized'
      | 'unsupported-capability'
      | 'control-rejected'
      | 'stale-revision',
    readonly status?: number,
  ) {
    super(message);
  }
}

@Injectable()
export class DsaClient {
  private readonly config = loadConfig();

  /** Read-only budget used by callers to derive bounded distributed leases. */
  get timeoutMs() {
    return this.config.dsaTimeoutMs;
  }

  async get<T>(path: string, attempts = 2): Promise<T> {
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
          const body = (await response.json().catch(() => null)) as {
            detail?: { code?: string; message?: string };
          } | null;
          const detail = body?.detail;
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
        return (await response.json()) as T;
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

  async post<T>(path: string, body: unknown, attempts = 2): Promise<T> {
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
          throw new DsaError(
            payload?.detail?.message ?? `DSA 返回 ${response.status}`,
            'unavailable',
            response.status,
          );
        }
        return (await response.json()) as T;
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

  async control<T>(path: string, init?: RequestInit, attempts = 1): Promise<T> {
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
          const detail = body?.detail;
          const code =
            detail?.code === 'unauthorized'
              ? 'unauthorized'
              : detail?.code === 'unsupported_capability'
                ? 'unsupported-capability'
                : detail?.code === 'STALE_REVISION'
                  ? 'stale-revision'
                  : response.status === 409 || response.status === 422
                    ? 'control-rejected'
                    : 'unavailable';
          throw new DsaError(
            detail?.message ?? `DSA Control 返回 ${response.status}`,
            code,
            response.status,
          );
        }
        return (await response.json()) as T;
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

  capabilities() {
    return this.get<{
      contractVersion?: number;
      capabilities?: Record<string, unknown>;
    }>('/api/v1/thesis-ledger/capabilities', 1);
  }

  backtestCapabilities(): Promise<BacktestCapabilities> {
    return this.get<unknown>('/api/v1/thesis-ledger/v2/capabilities', 1).then((raw) =>
      backtestCapabilitiesSchema.parse(raw),
    );
  }

  backtestCalendar(input: {
    market: BacktestMarket;
    start: string;
    end: string;
    dataAsOf: string;
  }): Promise<BacktestCalendarResponse> {
    const params = new URLSearchParams(input);
    return this.get<unknown>(`/api/v1/thesis-ledger/v2/calendar?${params.toString()}`, 1).then(
      (raw) => backtestCalendarResponseSchema.parse(raw),
    );
  }

  backtestInstrumentFacts(
    input: BacktestInstrumentFactsRequest,
  ): Promise<BacktestInstrumentFactsResponse> {
    const params = new URLSearchParams(backtestInstrumentFactsRequestSchema.parse(input));
    return this.get<unknown>(
      `/api/v1/thesis-ledger/v2/instrument-facts?${params.toString()}`,
      1,
    ).then((raw) => backtestInstrumentFactsResponseSchema.parse(raw));
  }

  backtestCorporateActions(input: {
    symbol: string;
    market: BacktestMarket;
    instrumentType: BacktestInstrumentType;
    start: string;
    end: string;
    dataAsOf: string;
  }): Promise<BacktestCorporateActionsResponse> {
    const params = new URLSearchParams(input);
    return this.get<unknown>(
      `/api/v1/thesis-ledger/v2/corporate-actions?${params.toString()}`,
      1,
    ).then((raw) => backtestCorporateActionsResponseSchema.parse(raw));
  }

  backtestBars(input: {
    symbol: string;
    timeframe: '1m' | '1d';
    start?: string;
    end?: string;
    limit?: number;
  }): Promise<(BacktestMinuteBar | BacktestDailyBar)[]> {
    const params = new URLSearchParams({
      symbol: input.symbol,
      timeframe: input.timeframe,
      limit: String(input.limit ?? 10_000),
    });
    if (input.start) params.set('start', input.start);
    if (input.end) params.set('end', input.end);
    return this.get<unknown[]>(`/api/v1/thesis-ledger/v2/market/bars?${params.toString()}`, 1).then(
      (raw) =>
        raw.map((item) =>
          input.timeframe === '1m'
            ? backtestMinuteBarSchema.parse(item)
            : backtestDailyBarSchema.parse(item),
        ),
    );
  }

  marketBarsV2(input: {
    symbol: string;
    assetType: string;
    timeframe: '1m' | '1d';
    adjustment: 'none' | 'qfq' | 'hfq';
    start?: string;
    end?: string;
    limit?: number;
  }): Promise<BarSeriesV2> {
    const params = new URLSearchParams({
      symbol: input.symbol,
      assetType: input.assetType,
      timeframe: input.timeframe,
      adjustment: input.adjustment,
      limit: String(input.limit ?? 90),
    });
    if (input.start) params.set('start', input.start);
    if (input.end) params.set('end', input.end);
    return this.get<unknown>(`/api/v2/thesis-ledger/market/bars?${params.toString()}`, 1).then(
      (raw) => barSeriesV2Schema.parse(raw),
    );
  }

  calculateIndicatorsV2(input: {
    identity: BarSeriesV2['identity'];
    inputFingerprint: string;
    points: BarSeriesV2['points'];
    requests: Array<{ name: 'MA' | 'MACD' | 'RSI'; parameters: Record<string, number> }>;
  }): Promise<IndicatorCalculateResponseV2> {
    return this.post<unknown>('/api/v2/thesis-ledger/market/indicators/calculate', {
      contractVersion: 2,
      ...input,
    }, 1).then((raw) => indicatorCalculateResponseV2Schema.parse(raw));
  }

  fxRates(input: {
    baseCurrency: CurrencyV1;
    currencies: readonly CurrencyV1[];
    asOf?: string;
  }): Promise<FxRatesResponseV1> {
    const params = new URLSearchParams({
      baseCurrency: input.baseCurrency,
      currencies: [...new Set(input.currencies)].join(','),
    });
    if (input.asOf) params.set('asOf', input.asOf.slice(0, 10));
    return this.get<unknown>(`/api/v1/thesis-ledger/market/fx-rates?${params.toString()}`).then(
      (raw) => fxRatesResponseSchemaV1.parse(raw),
    );
  }

  controlHandshake(requestId = crypto.randomUUID()) {
    return this.control<{
      contractVersion: number;
      consumer: string;
      accepted: boolean;
    }>('/api/v1/thesis-ledger/control/handshake', {
      method: 'POST',
      body: JSON.stringify({
        contractVersion: 1,
        consumer: 'thesis-ledger',
        requestId,
        supportedVersions: [1],
      }),
    });
  }

  /** Control Contract V2 的显式握手；V1 调用方不会被隐式升级。 */
  controlHandshakeV2(requestId = crypto.randomUUID()) {
    return this.control<{
      contractVersion: number;
      consumer: string;
      accepted: boolean;
    }>('/api/v1/thesis-ledger/control/handshake', {
      method: 'POST',
      body: JSON.stringify({
        contractVersion: 2,
        consumer: 'thesis-ledger',
        requestId,
        supportedVersions: [2],
      }),
    });
  }

  controlProviders() {
    return this.control<{ providers: ProviderManifest[] }>(
      '/api/v1/thesis-ledger/control/providers',
    );
  }

  async longbridgeOAuth(action: ProviderOAuthAction) {
    let path = '/api/v1/thesis-ledger/control/providers/longbridge/oauth/sessions';
    let init: RequestInit = {};
    if (action.kind === 'create') {
      init = {
        method: 'POST',
        body: JSON.stringify({
          contractVersion: 1,
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
        init = { method: 'POST' };
      }
    }
    const raw = await this.control<unknown>(path, init);
    const schema =
      action.kind === 'current' ? currentProviderOAuthSessionSchema : providerOAuthSessionSchema;
    const parsed = schema.safeParse(raw);
    if (!parsed.success) throw new DsaError('DSA 授权状态响应不完整', 'invalid-response');
    return parsed.data;
  }

  saveControlProvider(
    providerId: string,
    input: {
      requestId?: string;
      enabled?: boolean;
      credential?: string;
      credentials?: { method: string; values: Record<string, unknown> };
      clearCredentials?: boolean;
      settings?: Record<string, unknown>;
    },
  ) {
    return this.control(
      `/api/v1/thesis-ledger/control/providers/${encodeURIComponent(providerId)}/config`,
      {
        method: 'POST',
        body: JSON.stringify({
          contractVersion: 1,
          consumer: 'thesis-ledger',
          requestId: input.requestId ?? crypto.randomUUID(),
          ...input,
        }),
      },
    );
  }

  testControlProvider(
    providerId: string,
    input: {
      requestId?: string;
      credential?: string;
      credentials?: { method: string; values: Record<string, unknown> };
    } = {},
  ) {
    return this.control(
      `/api/v1/thesis-ledger/control/providers/${encodeURIComponent(providerId)}/test`,
      {
        method: 'POST',
        body: JSON.stringify({
          contractVersion: 1,
          consumer: 'thesis-ledger',
          requestId: input.requestId ?? crypto.randomUUID(),
          ...input,
        }),
      },
    );
  }

  removeControlProvider(providerId: string, input: { requestId?: string; reason?: string } = {}) {
    return this.control(
      `/api/v1/thesis-ledger/control/providers/${encodeURIComponent(providerId)}/remove`,
      {
        method: 'POST',
        body: JSON.stringify({
          contractVersion: 1,
          consumer: 'thesis-ledger',
          requestId: input.requestId ?? crypto.randomUUID(),
          reason: input.reason ?? 'removed_by_consumer',
        }),
      },
    );
  }

  applyControlPolicy(policy: DesiredProviderPolicy) {
    return this.control('/api/v1/thesis-ledger/control/policies/apply', {
      method: 'POST',
      body: JSON.stringify(policy),
    });
  }

  applyControlPolicyV2(policy: DesiredProviderPolicyV2) {
    const validated = desiredProviderPolicyV2Schema.parse(policy);
    return this.control<{
      status: string;
      idempotent: boolean;
      desired: DesiredProviderPolicyV2;
      effective: EffectiveProviderPolicyV2;
      requestId: string;
    }>('/api/v1/thesis-ledger/control/policies/apply', {
      method: 'POST',
      body: JSON.stringify(validated),
    });
  }

  effectiveControlPolicyV2() {
    return this.control<{
      contractVersion: 2;
      consumer: 'thesis-ledger';
      projection: {
        effective: EffectiveProviderPolicyV2;
      } | null;
    }>('/api/v1/thesis-ledger/control/policies/effective').then((raw) => {
      if (raw.projection?.effective) effectiveProviderPolicyV2Schema.parse(raw.projection.effective);
      return raw;
    });
  }

  effectiveControlPolicy() {
    return this.control('/api/v1/thesis-ledger/control/policies/effective');
  }

  triggerCatalogJob(requestId = crypto.randomUUID()) {
    return this.control<CatalogJob>('/api/v1/thesis-ledger/control/catalog/jobs', {
      method: 'POST',
      body: JSON.stringify({
        contractVersion: 1,
        consumer: 'thesis-ledger',
        requestId,
      }),
    });
  }

  catalogJob(jobId: string) {
    return this.control<CatalogJob>(
      `/api/v1/thesis-ledger/control/catalog/jobs/${encodeURIComponent(jobId)}`,
    );
  }

  acknowledgeCatalog(generation: number, checksum: string, requestId = crypto.randomUUID()) {
    return this.control('/api/v1/thesis-ledger/control/catalog/ack', {
      method: 'POST',
      body: JSON.stringify({
        contractVersion: 1,
        consumer: 'thesis-ledger',
        requestId,
        generation,
        checksum,
      }),
    });
  }

  catalogSnapshot(cursor?: string) {
    const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
    return this.get<CatalogSnapshot>(`/api/v1/thesis-ledger/catalog/snapshot${query}`, 1);
  }

  catalogDelta(cursor: string) {
    return this.get<CatalogDelta>(
      `/api/v1/thesis-ledger/catalog/delta?cursor=${encodeURIComponent(cursor)}`,
      1,
    );
  }
}
