import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { DsaClient } from '../../src/integration/dsa/dsa.client.js';
import { runWithTrace } from '../../src/platform/structured-logger.js';

const createClient = (overrides: { controlToken?: string | undefined } = {}) =>
  Object.assign(Object.create(DsaClient.prototype), {
    config: {
      dsaBaseUrl: 'https://dsa.example.test',
      dsaTimeoutMs: 5_000,
      dsaToken: 'dsa-token',
      controlToken: 'control-token',
      ...overrides,
    },
  }) as DsaClient;

const fixture = (name: string) =>
  JSON.parse(
    readFileSync(new URL('../../../../packages/schemas/fixtures/' + name, import.meta.url), 'utf8'),
  ) as unknown;

const response = (body: unknown, status = 200) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }) as Response;

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

describe('DsaClient DSA V3 transport', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('图表指标只向 V3 路由发送当前合同', async () => {
    const timestamp = '2026-09-28T07:00:00.000Z';
    const fetchMock = vi.fn(async () => response({
      contractVersion: 3,
      engineVersion: 'dsa-indicator-v3',
      inputFingerprint: 'fingerprint-1',
      results: [{
        name: 'MA',
        parameters: { period: 5 },
        inputFingerprint: 'fingerprint-1',
        points: [{ timestamp, values: { ma5: 1 } }],
      }],
    }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await createClient().calculateIndicators({
      identity: { symbol: '510300.SH', assetType: 'ETF', timeframe: '1d', adjustment: 'qfq' },
      inputFingerprint: 'fingerprint-1',
      points: [{ timestamp, open: 1, high: 1, low: 1, close: 1, volume: 1, amount: 1,
        completionStatus: 'complete', availableAt: timestamp }],
      requests: [{ name: 'MA', parameters: { period: 5 } }],
    });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.pathname).toBe('/api/v3/thesis-ledger/market/indicators/calculate');
    expect(JSON.parse(String(init.body))).toMatchObject({ contractVersion: 3, inputFingerprint: 'fingerprint-1' });
    expect(result.engineVersion).toBe('dsa-indicator-v3');
  });

  it('独立解析 Control V3 handshake，并使用 Control Token', async () => {
    const request = fixture('market-control-v3.handshake.request.json') as {
      requestId: string;
    };
    const handshakeResponse = fixture('market-control-v3.handshake.response.json');
    const fetchMock = vi.fn(async () => response(handshakeResponse));
    vi.stubGlobal('fetch', fetchMock);

    const result = await createClient().controlHandshakeV3(request.requestId);

    expect(result.requestId).toBe(request.requestId);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url).toEqual(
      new URL('/api/v3/thesis-ledger/control/handshake', 'https://dsa.example.test'),
    );
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({
      authorization: 'Bearer control-token',
      'x-request-id': request.requestId,
    });
    expect(JSON.parse(String(init.body))).toEqual({
      contractVersion: 3,
      consumer: 'thesis-ledger',
      requestId: request.requestId,
      supportedVersions: [3],
    });
  });

  it('严格校验 Control V3 handshake 响应与版本拒绝错误', async () => {
    const request = fixture('market-control-v3.handshake.request.json') as {
      requestId: string;
    };
    const wrongRequestId = vi.fn(async () =>
      response({
        ...(fixture('market-control-v3.handshake.response.json') as object),
        requestId: 'different-request',
      }),
    );
    vi.stubGlobal('fetch', wrongRequestId);
    await expect(createClient().controlHandshakeV3(request.requestId)).rejects.toMatchObject({
      code: 'invalid-response',
    });

    const unsupported = fixture('market-control-v3.errors.json') as Array<Record<string, unknown>>;
    const unsupportedFetch = vi.fn(async () => response({ detail: unsupported[0] }, 422));
    vi.stubGlobal('fetch', unsupportedFetch);
    await expect(createClient().controlHandshakeV3(request.requestId)).rejects.toMatchObject({
      code: 'unsupported-capability',
      status: 422,
    });
  });

  it('通过独立 Control GET 读取并严格解析完整精确路由能力目录', async () => {
    const catalog = fixture('market-route-catalog-v3.complete.json') as {
      contractVersion: number;
      integrity: string;
      entries: unknown[];
    };
    const fetchMock = vi.fn(async () => response(catalog));
    vi.stubGlobal('fetch', fetchMock);

    const result = await createClient({ controlToken: 'control-token' }).marketRouteCatalogV3();

    expect(result).toEqual(catalog);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url).toEqual(
      new URL(
        '/api/v3/thesis-ledger/control/routes/capabilities?contractVersion=3',
        'https://dsa.example.test',
      ),
    );
    expect(init.method).toBeUndefined();
    expect(init.headers).toMatchObject({ authorization: 'Bearer control-token' });
  });

  it('partial 精确路由目录保留完整性元数据，但不暴露其中的 ready 行', async () => {
    const partial = fixture('market-route-catalog-v3.partial.json') as {
      integrity: string;
      entries: Array<{ state: string }>;
      [key: string]: unknown;
    };
    expect(partial.entries[0]?.state).toBe('ready');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response(partial)),
    );

    await expect(createClient().marketRouteCatalogV3()).resolves.toMatchObject({
      integrity: 'partial',
      entries: [],
    });
  });

  it('拒绝重复精确行、错误版本与缺失的路由目录响应', async () => {
    const catalog = fixture('market-route-catalog-v3.complete.json') as {
      contractVersion: number;
      entries: unknown[];
      [key: string]: unknown;
    };
    const firstEntry = catalog.entries[0];
    const invalidResponses = [
      { ...catalog, entries: [firstEntry, firstEntry] },
      { ...catalog, contractVersion: 2 },
      undefined,
    ];

    for (const invalid of invalidResponses) {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => response(invalid)),
      );
      await expect(createClient().marketRouteCatalogV3()).rejects.toMatchObject({
        code: 'invalid-response',
      });
    }
  });

  it('严格应用 V3 Policy，并按明确版本查询 Effective projection', async () => {
    const desired = fixture('market-route-v3.etf-qfq.json');
    const effective = fixture('market-control-v3.effective.etf-qfq.json');
    const applyResponse = {
      status: 'applied',
      idempotent: false,
      desired,
      effective,
      requestId: (desired as { requestId: string }).requestId,
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(applyResponse))
      .mockResolvedValueOnce(
        response({
          contractVersion: 3,
          consumer: 'thesis-ledger',
          projection: { effective },
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const client = createClient();
    const applied = await client.applyControlPolicyV3(desired as never);
    const projection = await client.effectiveControlPolicyV3();

    expect(applied.effective.sourceDesiredRevision).toBe(
      (desired as { revision: number }).revision,
    );
    expect(projection.projection?.effective.revision).toBe(1);
    const [applyUrl, applyInit] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    const [effectiveUrl, effectiveInit] = fetchMock.mock.calls[1] as unknown as [URL, RequestInit];
    expect(applyUrl.pathname).toBe('/api/v3/thesis-ledger/control/policies/apply');
    expect(JSON.parse(String(applyInit.body))).toEqual(desired);
    expect(applyInit.headers).toMatchObject({ authorization: 'Bearer control-token' });
    expect(effectiveUrl.pathname).toBe('/api/v3/thesis-ledger/control/policies/effective');
    expect(effectiveUrl.searchParams.get('contractVersion')).toBe('3');
    expect(effectiveInit.headers).toMatchObject({ authorization: 'Bearer control-token' });
  });

  it('要求 Apply Effective 保留 Desired 路由和目标顺序，同时允许可用状态变化', async () => {
    const desired = fixture('market-route-v3.etf-qfq.json') as {
      requestId: string;
      routes: Array<{ key: Record<string, unknown>; targets: Array<Record<string, unknown>> }>;
      [key: string]: unknown;
    };
    const effective = fixture('market-control-v3.effective.etf-qfq.json') as {
      routes: Array<{
        key: Record<string, unknown>;
        reason: string | null;
        targets: Array<Record<string, unknown>>;
      }>;
      [key: string]: unknown;
    };
    const baseResponse = {
      status: 'applied',
      idempotent: false,
      desired,
      requestId: desired.requestId,
    };
    const unavailableTarget = {
      ...effective,
      routes: [
        {
          ...effective.routes[0]!,
          reason: 'not_admitted',
          targets: effective.routes[0]!.targets.map((target) => ({
            ...target,
            eligible: false,
            reason: 'not_admitted',
          })),
        },
      ],
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response({ ...baseResponse, effective: unavailableTarget })),
    );
    const accepted = await createClient().applyControlPolicyV3(desired as never);
    expect(accepted.effective.routes[0]?.targets[0]?.eligible).toBe(false);

    const mismatchedKey = {
      ...effective,
      routes: [
        {
          ...effective.routes[0]!,
          key: { ...effective.routes[0]!.key, adjustment: 'hfq' },
        },
      ],
    };
    const mismatchedTarget = {
      ...effective,
      routes: [
        {
          ...effective.routes[0]!,
          targets: effective.routes[0]!.targets.map((target) => ({
            ...target,
            providerId: 'different-provider',
          })),
        },
      ],
    };

    for (const invalidEffective of [mismatchedKey, mismatchedTarget]) {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => response({ ...baseResponse, effective: invalidEffective })),
      );
      await expect(createClient().applyControlPolicyV3(desired as never)).rejects.toMatchObject({
        code: 'invalid-response',
      });
    }
  });

  it('通过 Data Token 单独读取 V3 能力与严格匹配的 BarSeries', async () => {
    const capabilities = fixture('market-data-v3.capabilities.json');
    const request = fixture('market-data-v3.request.etf-qfq.json') as {
      requestId: string;
      symbol: string;
      routeKey: unknown;
      start: string;
      end: string;
    };
    const bars = fixture('market-data-v3.response.etf-qfq.json');
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(capabilities))
      .mockResolvedValueOnce(response(bars));
    vi.stubGlobal('fetch', fetchMock);

    const client = createClient({ controlToken: undefined });
    const parsedCapabilities = await client.marketDataCapabilitiesV3();
    const parsedBars = await client.marketBarsV3(request as never);

    expect(parsedCapabilities.dataContractVersions).toEqual([3]);
    expect(parsedBars.requestId).toBe(request.requestId);
    const [capabilitiesUrl, capabilitiesInit] = fetchMock.mock.calls[0] as unknown as [
      URL,
      RequestInit,
    ];
    const [barsUrl, barsInit] = fetchMock.mock.calls[1] as unknown as [URL, RequestInit];
    expect(capabilitiesUrl.pathname).toBe('/api/v3/thesis-ledger/capabilities');
    expect(capabilitiesInit.headers).toMatchObject({ authorization: 'Bearer dsa-token' });
    expect(barsUrl.pathname).toBe('/api/v3/thesis-ledger/market/bars');
    expect(barsInit.method).toBe('POST');
    expect(barsInit.headers).toMatchObject({ authorization: 'Bearer dsa-token' });
    expect(JSON.parse(String(barsInit.body))).toEqual(request);
  });

  it('发送显式 RouteTarget pin，并拒绝与 pin 不一致的 provenance', async () => {
    const request = fixture('market-data-v3.request.etf-qfq-target-pinned.json') as Record<
      string,
      unknown
    >;
    const bars = fixture('market-data-v3.response.etf-qfq.json') as {
      provenance: Record<string, unknown>;
    };
    const fetchMock = vi.fn(async () => response(bars));
    vi.stubGlobal('fetch', fetchMock);

    const result = await createClient().marketBarsV3(request as never);
    expect(result.provenance).toEqual(bars.provenance);
    const [, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual(request);

    const provenanceVariants = [
      { ...bars.provenance, providerId: 'another-provider' },
      { ...bars.provenance, upstreamSource: 'another-upstream' },
      { ...bars.provenance, routeIndex: 1 },
    ];
    for (const provenance of provenanceVariants) {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => response({ ...bars, provenance })),
      );
      await expect(createClient().marketBarsV3(request as never)).rejects.toMatchObject({
        code: 'invalid-response',
      });
    }
  });

  it('拒绝 BarSeries 回显错配，并映射共享 Data V3 安全错误码', async () => {
    const request = fixture('market-data-v3.request.etf-qfq.json') as { requestId: string };
    const responseBody = fixture('market-data-v3.response.etf-qfq.json') as Record<string, unknown>;
    const mismatched = vi.fn(async () =>
      response({ ...responseBody, requestId: 'different-request' }),
    );
    vi.stubGlobal('fetch', mismatched);
    await expect(createClient().marketBarsV3(request as never)).rejects.toMatchObject({
      code: 'invalid-response',
    });

    const errors = fixture('market-data-v3.errors.json') as Array<Record<string, unknown>>;
    const insufficientCoverage = {
      ...(errors[2] as Record<string, unknown>),
      requestId: request.requestId,
    };
    const failedFetch = vi.fn(async () => response({ detail: insufficientCoverage }, 422));
    vi.stubGlobal('fetch', failedFetch);
    await expect(createClient().marketBarsV3(request as never)).rejects.toMatchObject({
      code: 'insufficient-coverage',
      status: 422,
      message: '请求区间的数据覆盖不足',
    });
  });

  it('逐一映射共享 Data V3 的五种错误码，并拒绝畸形错误 envelope', async () => {
    const request = fixture('market-data-v3.request.etf-qfq.json') as { requestId: string };
    const errors = fixture('market-data-v3.errors.json') as Array<Record<string, unknown>>;
    const expected = [
      ['unsupported-capability', '不支持请求的数据契约版本'],
      ['unsupported-capability', '来源不支持请求的价格口径'],
      ['insufficient-coverage', '请求区间的数据覆盖不足'],
      ['unavailable', '行情上游暂时不可用'],
      ['invalid-response', '行情上游响应格式无效'],
    ];

    for (const [index, [code, message]] of expected.entries()) {
      const error = { ...errors[index], requestId: request.requestId };
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => response({ detail: error }, 502)),
      );
      await expect(createClient().marketBarsV3(request as never)).rejects.toMatchObject({
        code,
        status: 502,
        message,
      });
    }

    const malformed = {
      ...errors[0],
      requestId: request.requestId,
      unexpected: 'must be rejected',
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response({ detail: malformed }, 422)),
    );
    await expect(createClient().marketBarsV3(request as never)).rejects.toMatchObject({
      code: 'invalid-response',
      status: 422,
    });
  });

});
