import { delay } from 'es-toolkit';
import { retryAfterMilliseconds } from '@thesis-ledger/api-client';

export function createRateLimitedFetch(fetcher: typeof fetch = fetch): typeof fetch {
  const blockedUntil = new Map<string, number>();
  return async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    const method = init?.method ?? (input instanceof Request ? input.method : 'GET');
    const key = `${new URL(url).origin}:${method.toUpperCase()}`;
    const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
    for (;;) {
      const remaining = (blockedUntil.get(key) ?? 0) - Date.now();
      if (remaining <= 0) break;
      await delay(remaining, signal ? { signal } : {});
    }
    signal?.throwIfAborted();
    const response = await fetcher(input, init);
    if (response.status === 429) {
      const wait = retryAfterMilliseconds(response.headers.get('retry-after')) ?? 60_000;
      blockedUntil.set(key, Math.max(blockedUntil.get(key) ?? 0, Date.now() + wait));
    }
    return response;
  };
}
