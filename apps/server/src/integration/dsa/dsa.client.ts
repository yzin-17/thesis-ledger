import { Injectable } from '@nestjs/common';
import type {
  CatalogSnapshot,
  CatalogDelta,
  DesiredProviderPolicy,
  ProviderManifest,
} from '@thesis-ledger/schemas';
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
        if (!response.ok) throw new DsaError(`DSA 返回 ${response.status}`, 'unavailable', response.status);
        return (await response.json()) as T;
      } catch (error) {
        lastError = error;
        if (attempt + 1 < attempts) await new Promise((resolve) => setTimeout(resolve, 100 * 2 ** attempt));
      }
    }
    if (lastError instanceof DsaError) throw lastError;
    throw new DsaError('DSA 不可用', 'unavailable');
  }

  health() { return this.get<unknown>('/health', 1); }

  capabilities() {
    return this.get<{ contractVersion?: number; capabilities?: Record<string, unknown> }>(
      '/api/v1/thesis-ledger/capabilities',
      1,
    );
  }

  catalogSnapshot(cursor?: string) {
    const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
    return this.get<CatalogSnapshot>(`/api/v1/thesis-ledger/catalog/snapshot${query}`, 1);
  }

  catalogDelta(cursor: string) {
    return this.get<CatalogDelta>(`/api/v1/thesis-ledger/catalog/delta?cursor=${encodeURIComponent(cursor)}`, 1);
  }

  controlProviders() {
    return this.get<{ providers: ProviderManifest[] }>('/api/v1/thesis-ledger/control/providers', 1);
  }

  applyControlPolicy(policy: DesiredProviderPolicy) {
    return this.get('/api/v1/thesis-ledger/control/policies/apply', 1);
  }
}
