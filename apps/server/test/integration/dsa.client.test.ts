import { afterEach, describe, expect, it, vi } from 'vitest';
import { DsaClient } from '../../src/integration/dsa/dsa.client.js';
import { runWithTrace } from '../../src/platform/structured-logger.js';

const createClient = () =>
  Object.assign(Object.create(DsaClient.prototype), {
    config: {
      dsaBaseUrl: 'https://dsa.example.test',
      dsaTimeoutMs: 5_000,
      dsaToken: 'dsa-token',
    },
  }) as DsaClient;

describe('DsaClient trace headers', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('将同一个 currentTraceId 同时发送为 x-trace-id 和 x-request-id，并保留认证头', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    await runWithTrace('trace-for-dsa', () => createClient().get('/quote', 1));

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = (
      fetchMock.mock.calls as unknown as Array<[URL, RequestInit | undefined]>
    )[0]!;
    expect(url).toEqual(new URL('/quote', 'https://dsa.example.test'));
    expect(init?.headers).toEqual({
      authorization: 'Bearer dsa-token',
      'x-trace-id': 'trace-for-dsa',
      'x-request-id': 'trace-for-dsa',
    });
  });
});
