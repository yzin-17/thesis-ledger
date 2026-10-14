import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  marketPeriodIndicatorRequestSchema,
  marketPeriodIndicatorCapabilitiesSchema,
} from '@thesis-ledger/schemas';
import { DsaClient } from '../../src/integration/dsa/dsa.client.js';

const fixture = JSON.parse(
  readFileSync(
    new URL(
      '../../../../packages/schemas/fixtures/market-period-indicator-v1.shared.json',
      import.meta.url,
    ),
    'utf8',
  ),
) as { cases: Array<{ timeframe: string; payload: unknown }> };
const cases = fixture.cases.map((row) => ({
  ...row,
  payload: marketPeriodIndicatorRequestSchema.parse(row.payload),
}));
const client = () =>
  Object.assign(Object.create(DsaClient.prototype), {
    config: {
      dsaBaseUrl: 'https://dsa.example.test',
      dsaTimeoutMs: 5000,
      dsaToken: 'period-test-token',
    },
  }) as DsaClient;
const result = (payload: (typeof cases)[number]['payload']) => ({
  contractVersion: 3,
  engineVersion: 'dsa-indicator-v3',
  inputFingerprint: payload.inputFingerprint,
  results: payload.requests.map((request) => ({
    ...request,
    inputFingerprint: payload.inputFingerprint,
    points: [],
  })),
});
describe('DSA 派生指标传输', () => {
  afterEach(() => vi.unstubAllGlobals());
  it.each(cases)('$timeframe 保留聚合上下文及指纹，仅发送当前端点', async ({ payload }) => {
    const fetcher = vi.fn(
      async () => new Response(JSON.stringify(result(payload)), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetcher);
    expect((await client().calculatePeriodIndicators(payload)).inputFingerprint).toBe(
      payload.inputFingerprint,
    );
    const [url, init] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.pathname).toBe('/api/v3/thesis-ledger/market/indicators/calculate');
    expect(JSON.parse(String(init.body))).toEqual(payload);
    expect(init.headers).toMatchObject({ authorization: 'Bearer period-test-token' });
  });
  it('拒绝与本次计算输入不一致的响应', async () => {
    const payload = cases[0]!.payload;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ ...result(payload), inputFingerprint: 'f'.repeat(64) }), {
            status: 200,
          }),
      ),
    );
    await expect(client().calculatePeriodIndicators(payload)).rejects.toThrow();
  });
  it('读取独立计算能力，不改变 Data V3 握手', async () => {
    const raw: unknown = JSON.parse(
      readFileSync(
        new URL(
          '../../../../packages/schemas/fixtures/market-period-indicator-capabilities-v1.shared.json',
          import.meta.url,
        ),
        'utf8',
      ),
    );
    const caps = marketPeriodIndicatorCapabilitiesSchema.parse(raw);
    const fetcher = vi.fn(async () => new Response(JSON.stringify(caps), { status: 200 }));
    vi.stubGlobal('fetch', fetcher);
    expect(await client().marketPeriodIndicatorCapabilities()).toEqual(caps);
    expect((fetcher.mock.calls[0] as unknown as [URL])[0].pathname).toBe(
      '/api/v3/thesis-ledger/market/indicators/capabilities',
    );
  });
});
