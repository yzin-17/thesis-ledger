import { Injectable } from '@nestjs/common';
import { loadConfig } from '../platform/config.js';
import { currentTraceId } from '../platform/structured-logger.js';

export class DsaError extends Error {
  constructor(
    message: string,
    readonly code:
      'timeout' | 'unavailable' | 'invalid-response' | 'unauthorized' | 'unsupported-capability',
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

  health() {
    return this.get<unknown>('/health', 1);
  }

  capabilities() {
    return this.get<{
      contractVersion?: number;
      capabilities?: Record<string, unknown>;
    }>('/api/v1/thesis-ledger/capabilities', 1);
  }
}
