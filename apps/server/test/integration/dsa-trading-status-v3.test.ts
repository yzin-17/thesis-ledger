import { afterEach, describe, expect, it, vi } from 'vitest';
import { DsaDataCapabilityReaderV3 } from '../../src/integration/dsa/dsa-data-capability-reader-v3.js';
import { DsaClient } from '../../src/integration/dsa/dsa.client.js';
import { tradingStatusInputs } from '../backtest/trading-status-fixtures.js';

afterEach(() => vi.unstubAllGlobals());

describe('DSA 停复牌请求绑定', () => {
  it('复用 Client 的 Data Token 传输，一次精确整窗请求保留 unknown', async () => {
    const { request, response } = await tradingStatusInputs();
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => response }));
    vi.stubGlobal('fetch', fetchMock);
    const client = Object.assign(Object.create(DsaClient.prototype), {
      config: {
        dsaBaseUrl: 'https://dsa.example.test',
        dsaTimeoutMs: 5000,
        dsaToken: 'test-data-token',
      },
    }) as DsaClient;
    expect(await client.marketTradingStatusV3(request)).toEqual(response);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.toString()).toBe(
      'https://dsa.example.test/api/v3/thesis-ledger/market/trading-status',
    );
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ authorization: 'Bearer test-data-token' });
    expect(JSON.parse(init.body as string)).toEqual(request);
    expect(response.days.map((day) => day.state)).toEqual([
      'unknown',
      'suspended',
      'trading',
      'unknown',
      'unknown',
      'unknown',
    ]);
  });

  it.each(['symbol', 'requestId', 'target', 'provenance', 'window', 'missingDay'] as const)(
    '拒绝 %s 错绑或不完整响应',
    async (field) => {
      const { request, response } = await tradingStatusInputs();
      if (field === 'symbol') response.symbol = '600000.SH';
      else if (field === 'requestId') response.requestId = 'wrong-request';
      else if (field === 'target') response.routeTarget.routeIndex = 1;
      else if (field === 'provenance') response.provenance.upstreamSource = 'wrong-source';
      else if (field === 'window') {
        response.range.start = '2023-08-17';
        response.days.shift();
      } else response.days.pop();
      const reader = new DsaDataCapabilityReaderV3(
        async () => response,
        (parse) => parse(),
      );
      await expect(reader.tradingStatus(request)).rejects.toMatchObject({
        code: 'invalid-response',
      });
    },
  );

  it('只把当前单日请求送入来源，不附加未来复牌状态', async () => {
    const { request, response } = await tradingStatusInputs();
    request.range = { start: '2023-08-17', end: '2023-08-17' };
    response.range = request.range;
    response.days = response.days.filter((day) => day.date === request.range.start);
    const post = vi.fn(async () => response);
    const reader = new DsaDataCapabilityReaderV3(post, (parse) => parse());
    const result = await reader.tradingStatus(request);
    expect(post).toHaveBeenCalledOnce();
    expect(result.days).toHaveLength(1);
    expect(result.days[0]?.state).toBe('suspended');
  });
});
