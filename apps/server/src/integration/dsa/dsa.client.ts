import { Injectable } from '@nestjs/common';
import type {
  CatalogSnapshot,
  CatalogDelta,
  DesiredProviderPolicy,
  ProviderManifest,
  CurrencyV1,
  FxRatesResponseV1,
} from '@thesis-ledger/schemas';
import { fxRatesResponseSchemaV1 } from '@thesis-ledger/schemas';
import { loadConfig } from '../../platform/config.js';
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
      | 'control-rejected',
    readonly status?: number,
  ) {
    super(message);
  }
}

@Injectable()
export class DsaClient {
  private readonly config = loadConfig();

  async get<T>(path: string, attempts = 2): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        const response = await fetch(new URL(path, this.config.dsaBaseUrl), {
          signal: AbortSignal.timeout(this.config.dsaTimeoutMs),
          headers: {
            authorization: `Bearer ${this.config.dsaToken}`,
            'x-trace-id': currentTraceId() ?? crypto.randomUUID(),
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

  controlProviders() {
    return this.control<{ providers: ProviderManifest[] }>(
      '/api/v1/thesis-ledger/control/providers',
    );
  }

  saveControlProvider(
    providerId: string,
    input: {
      requestId?: string;
      enabled?: boolean;
      credential?: string;
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

  testControlProvider(providerId: string, input: { requestId?: string; credential?: string } = {}) {
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
