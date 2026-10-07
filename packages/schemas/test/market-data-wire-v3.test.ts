import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  canonicalMarketCoverageProofEncodingV3,
  marketDataBarSeriesRequestV3Schema,
  marketDataBarSeriesRequestResponseV3Schema,
  marketDataBarSeriesResponseV3Schema,
  marketDataContractCapabilitiesV3Schema,
  marketDataErrorEnvelopeV3Schema,
} from '../src/market-data-wire-v3.js';

const fixture = (name: string) =>
  JSON.parse(readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8')) as unknown;

const capabilitiesFixture = () => fixture('market-data-v3.capabilities.json');
const requestFixture = () => fixture('market-data-v3.request.etf-qfq.json');
const targetPinnedRequestFixture = () =>
  fixture('market-data-v3.request.etf-qfq-target-pinned.json');
const responseFixture = () => fixture('market-data-v3.response.etf-qfq.json');

describe('Market Data Wire V3', () => {
  it('通过共享 fixture 冻结 Data 能力、精确口径请求和来源价格响应', () => {
    const capabilities = marketDataContractCapabilitiesV3Schema.parse(capabilitiesFixture());
    const request = marketDataBarSeriesRequestV3Schema.parse(requestFixture());
    const response = marketDataBarSeriesResponseV3Schema.parse(responseFixture());

    expect(capabilities.dataContractVersions).toEqual([3]);
    expect(capabilities.serviceCapabilities.fundNav).toBe(true);
    expect(request.routeKey).toMatchObject({
      kind: 'bar',
      capability: 'DAILY_BAR',
      adjustment: 'qfq',
    });
    expect(response.routeKey).toEqual(request.routeKey);
    expect(response.requestId).toBe(request.requestId);
    expect(response.symbol).toBe(request.symbol);
    expect(response.coverage.requestedStart).toBe(request.start);
    expect(response.coverage.requestedEnd).toBe(request.end);
    expect(response.coverageProof.calendar.expectedSessionDates).toEqual([
      '2026-05-18',
      '2026-05-19',
      '2026-05-20',
    ]);
    expect(response.provenance).toEqual({
      providerId: 'hithink',
      upstreamSource: 'hithink-financial-api',
      routeIndex: 0,
      effectivePolicyRevision: 1,
    });
    expect(response.sourcePriceBasis.adjustment).toBe('qfq');
    expect(response.inputFingerprint).toBe('v3-fixture-fingerprint-1');
  });

  it('接受可选严格 RouteTarget pin，同时兼容无 pin 的旧 V3 请求', () => {
    const legacyRequest = marketDataBarSeriesRequestV3Schema.parse(requestFixture());
    const pinnedRequest = marketDataBarSeriesRequestV3Schema.parse(targetPinnedRequestFixture());
    const routeTarget = pinnedRequest.routeTarget!;

    expect(legacyRequest.routeTarget).toBeUndefined();
    expect(pinnedRequest.routeTarget).toEqual({
      providerId: 'hithink',
      upstreamSource: 'hithink-financial-api',
      routeIndex: 0,
    });
    expect(
      marketDataBarSeriesRequestV3Schema.safeParse({
        ...pinnedRequest,
        routeTarget: { ...routeTarget, routeIndex: 2 },
      }).success,
    ).toBe(false);
    expect(
      marketDataBarSeriesRequestV3Schema.safeParse({
        ...pinnedRequest,
        routeTarget: { ...routeTarget, unexpected: true },
      }).success,
    ).toBe(false);
    expect(
      marketDataBarSeriesRequestV3Schema.safeParse({
        ...pinnedRequest,
        routeTarget: {
          providerId: 'hithink',
          routeIndex: 0,
        },
      }).success,
    ).toBe(false);
  });

  it('要求固定目标的响应 provenance 与请求 pin 完全一致', () => {
    const request = targetPinnedRequestFixture();
    const response = marketDataBarSeriesResponseV3Schema.parse(responseFixture());

    expect(
      marketDataBarSeriesRequestResponseV3Schema.safeParse({ request, response }).success,
    ).toBe(true);
    for (const provenance of [
      { ...response.provenance, providerId: 'other-provider' },
      { ...response.provenance, upstreamSource: 'other-source' },
      { ...response.provenance, routeIndex: 1 },
    ]) {
      expect(
        marketDataBarSeriesRequestResponseV3Schema.safeParse({
          request,
          response: { ...response, provenance },
        }).success,
      ).toBe(false);
    }

    const legacyRequest = requestFixture();
    expect(
      marketDataBarSeriesRequestResponseV3Schema.safeParse({
        request: legacyRequest,
        response: { ...response, provenance: { ...response.provenance, providerId: 'other' } },
      }).success,
    ).toBe(true);
  });

  it('仅声明当前 Data 版本并独立于 Control 版本', () => {
    expect(
      marketDataContractCapabilitiesV3Schema.safeParse({ dataContractVersions: [3], serviceCapabilities: { fundNav: true } }).success,
    ).toBe(true);
    expect(
      marketDataContractCapabilitiesV3Schema.safeParse({ dataContractVersions: [2, 2, 3], serviceCapabilities: { fundNav: true } }).success,
    ).toBe(false);
    expect(
      marketDataContractCapabilitiesV3Schema.safeParse({
        dataContractVersions: [2, 3],
        serviceCapabilities: { fundNav: true },
        controlContractVersion: 2,
      }).success,
    ).toBe(false);
    expect(
      marketDataContractCapabilitiesV3Schema.safeParse({ dataContractVersions: [], serviceCapabilities: { fundNav: true } }).success,
    ).toBe(false);
  });

  it('拒绝缺字段、未知字段和 Server 记账语义进入 DSA BarSeries', () => {
    const request = marketDataBarSeriesRequestV3Schema.parse(requestFixture());
    const response = marketDataBarSeriesResponseV3Schema.parse(responseFixture());
    const requestWithoutRouteKey: Partial<typeof request> = { ...request };
    const responseWithoutBasis: Partial<typeof response> = { ...response };
    delete requestWithoutRouteKey.routeKey;
    delete responseWithoutBasis.sourcePriceBasis;

    expect(marketDataBarSeriesRequestV3Schema.safeParse({ ...request, limit: 90 }).success).toBe(
      false,
    );
    expect(marketDataBarSeriesRequestV3Schema.safeParse(requestWithoutRouteKey).success).toBe(
      false,
    );
    expect(
      marketDataBarSeriesRequestV3Schema.safeParse({
        ...request,
        routeKey: { ...(request.routeKey as object), controlContractVersion: 2 },
      }).success,
    ).toBe(false);
    expect(marketDataBarSeriesResponseV3Schema.safeParse(responseWithoutBasis).success).toBe(false);
    expect(
      marketDataBarSeriesResponseV3Schema.safeParse({ ...response, controlContractVersion: 2 })
        .success,
    ).toBe(false);
    expect(
      marketDataBarSeriesResponseV3Schema.safeParse({
        ...response,
        sourcePriceBasis: {
          ...response.sourcePriceBasis,
          quantityBasis: 'actual-units',
        },
      }).success,
    ).toBe(false);
    expect(
      marketDataBarSeriesResponseV3Schema.safeParse({
        ...response,
        sourcePriceBasis: {
          ...response.sourcePriceBasis,
          accountingBasis: 'raw-events',
        },
      }).success,
    ).toBe(false);
    expect(
      marketDataBarSeriesResponseV3Schema.safeParse({
        ...response,
        sourcePriceBasis: {
          ...response.sourcePriceBasis,
          history: { basis: 'fixed-provider-snapshot' },
        },
      }).success,
    ).toBe(false);
    expect(
      marketDataBarSeriesResponseV3Schema.safeParse({
        ...response,
        bars: [
          { ...response.bars[0], providerError: 'raw upstream detail' },
          ...response.bars.slice(1),
        ],
      }).success,
    ).toBe(false);
    expect(
      marketDataBarSeriesResponseV3Schema.safeParse({
        ...response,
        provenance: { ...response.provenance, providerRevision: 'server-only-cache-revision' },
      }).success,
    ).toBe(false);
  });

  it('校验窗口次序、Bar 顺序与 coverage 边界，并要求源口径匹配 RouteKey', () => {
    const request = marketDataBarSeriesRequestV3Schema.parse(requestFixture());
    const response = marketDataBarSeriesResponseV3Schema.parse(responseFixture());

    expect(
      marketDataBarSeriesRequestV3Schema.safeParse({ ...request, start: '2026-05-21' }).success,
    ).toBe(false);
    expect(
      marketDataBarSeriesRequestV3Schema.safeParse({
        ...request,
        routeKey: { ...request.routeKey, timeframe: '1m' },
      }).success,
    ).toBe(false);
    expect(
      marketDataBarSeriesResponseV3Schema.safeParse({
        ...response,
        sourcePriceBasis: { ...response.sourcePriceBasis, adjustment: 'hfq' },
      }).success,
    ).toBe(false);
    expect(
      marketDataBarSeriesResponseV3Schema.safeParse({
        ...response,
        bars: [response.bars[1], response.bars[0], response.bars[2]],
      }).success,
    ).toBe(false);
    expect(
      marketDataBarSeriesResponseV3Schema.safeParse({
        ...response,
        bars: [{ ...response.bars[0], high: 0.5 }, ...response.bars.slice(1)],
      }).success,
    ).toBe(false);
    expect(
      marketDataBarSeriesResponseV3Schema.safeParse({
        ...response,
        coverage: { ...response.coverage, actualEnd: null },
      }).success,
    ).toBe(false);
  });

  it('按日历时区逐日校验完整 Bar，且仅从独立上市事实起比较预期日期', () => {
    const response = marketDataBarSeriesResponseV3Schema.parse(responseFixture());
    const utcBoundaryBars = {
      ...response,
      bars: response.bars.map((bar: Record<string, unknown>, index: number) => ({
        ...bar,
        timestamp: `2026-05-${String(17 + index).padStart(2, '0')}T16:00:00.000Z`,
      })),
      coverage: {
        ...response.coverage,
        actualStart: '2026-05-17T16:00:00.000Z',
        actualEnd: '2026-05-19T16:00:00.000Z',
      },
    };
    expect(marketDataBarSeriesResponseV3Schema.safeParse(utcBoundaryBars).success).toBe(true);

    const crossListingWindow = {
      ...response,
      bars: [
        { ...response.bars[0], timestamp: '2023-07-27T07:00:00.000Z' },
        { ...response.bars[1], timestamp: '2023-07-28T07:00:00.000Z' },
      ],
      coverage: {
        ...response.coverage,
        requestedStart: '2023-07-26',
        requestedEnd: '2023-07-28',
        actualStart: '2023-07-27T07:00:00.000Z',
        actualEnd: '2023-07-28T07:00:00.000Z',
        latestCompleteTradingDate: '2023-07-28',
      },
      coverageProof: {
        ...response.coverageProof,
        calendar: {
          ...response.coverageProof.calendar,
          expectedSessionDates: ['2023-07-26', '2023-07-27', '2023-07-28'],
        },
        window: {
          status: 'complete',
          requestedStart: '2023-07-26',
          requestedEnd: '2023-07-28',
        },
      },
    };
    expect(marketDataBarSeriesResponseV3Schema.safeParse(crossListingWindow).success).toBe(true);
    expect(
      marketDataBarSeriesResponseV3Schema.safeParse({
        ...crossListingWindow,
        bars: [
          { ...crossListingWindow.bars[0], completionStatus: 'unknown' },
          crossListingWindow.bars[1],
        ],
      }).success,
    ).toBe(false);
    expect(
      marketDataBarSeriesResponseV3Schema.safeParse({
        ...crossListingWindow,
        bars: [crossListingWindow.bars[0]],
      }).success,
    ).toBe(false);
  });

  it('拒绝日历/上市证据冲突、未知完成状态、范围外证明及纯上市前成功窗口', () => {
    const response = marketDataBarSeriesResponseV3Schema.parse(responseFixture());
    expect(
      marketDataBarSeriesResponseV3Schema.safeParse({
        ...response,
        coverageProof: {
          ...response.coverageProof,
          calendar: { ...response.coverageProof.calendar, timezone: 'Asia/Hong_Kong' },
        },
      }).success,
    ).toBe(false);
    expect(
      marketDataBarSeriesResponseV3Schema.safeParse({
        ...response,
        coverageProof: {
          ...response.coverageProof,
          calendar: {
            ...response.coverageProof.calendar,
            expectedSessionDates: ['2026-05-18', '2026-05-18', '2026-05-20'],
          },
        },
      }).success,
    ).toBe(false);
    expect(
      marketDataBarSeriesResponseV3Schema.safeParse({
        ...response,
        coverageProof: {
          ...response.coverageProof,
          listing: { ...response.coverageProof.listing, symbol: '000001.SZ' },
        },
      }).success,
    ).toBe(false);
    expect(
      marketDataBarSeriesResponseV3Schema.safeParse({
        ...response,
        coverageProof: {
          ...response.coverageProof,
          calendar: {
            ...response.coverageProof.calendar,
            supportedRange: { start: '2026-05-19', end: '2030-12-31' },
          },
        },
      }).success,
    ).toBe(false);
    expect(
      marketDataBarSeriesResponseV3Schema.safeParse({
        ...response,
        coverageProof: {
          ...response.coverageProof,
          pagination: { status: 'unknown', pagesFetched: 1, continuationPending: true },
        },
      }).success,
    ).toBe(false);

    const preListingWindow = {
      ...response,
      bars: [],
      coverage: {
        ...response.coverage,
        requestedStart: '2020-01-02',
        requestedEnd: '2020-01-03',
        actualStart: null,
        actualEnd: null,
        latestCompleteTradingDate: null,
      },
      coverageProof: {
        ...response.coverageProof,
        calendar: {
          ...response.coverageProof.calendar,
          expectedSessionDates: ['2020-01-02', '2020-01-03'],
        },
        window: { status: 'complete', requestedStart: '2020-01-02', requestedEnd: '2020-01-03' },
      },
    };
    expect(marketDataBarSeriesResponseV3Schema.safeParse(preListingWindow).success).toBe(false);
  });

  it('以固定字段顺序编码证明，输入对象键顺序不会改变缓存身份', () => {
    const response = marketDataBarSeriesResponseV3Schema.parse(responseFixture());
    const proof = response.coverageProof;
    const reorderedProof = {
      pagination: proof.pagination,
      window: proof.window,
      listing: proof.listing,
      calendar: proof.calendar,
    };
    expect(canonicalMarketCoverageProofEncodingV3(proof)).toBe(
      canonicalMarketCoverageProofEncodingV3(reorderedProof),
    );
  });

  it('以固定版本 envelope 和 code map 返回安全错误，不接受原始上游错误', () => {
    const errors = fixture('market-data-v3.errors.json') as unknown[];
    const parsed = errors.map((error) => marketDataErrorEnvelopeV3Schema.parse(error));

    expect(parsed.map(({ error }) => error.code)).toEqual([
      'unsupported_data_contract_version',
      'unsupported_price_basis',
      'insufficient_coverage',
      'upstream_failure',
      'invalid_response',
    ]);
    expect(
      marketDataErrorEnvelopeV3Schema.safeParse({
        contractVersion: 3,
        requestId: 'provider-error',
        error: {
          code: 'upstream_failure',
          message: 'ReadTimeout at vendor.example with token details',
        },
      }).success,
    ).toBe(false);
    expect(
      marketDataErrorEnvelopeV3Schema.safeParse({
        contractVersion: 3,
        requestId: 'provider-error',
        error: {
          code: 'upstream_failure',
          message: '行情上游暂时不可用',
          vendorMessage: 'raw supplier error',
        },
      }).success,
    ).toBe(false);
    expect(
      marketDataErrorEnvelopeV3Schema.safeParse({
        contractVersion: 2,
        requestId: 'old-version',
        error: { code: 'upstream_failure', message: '行情上游暂时不可用' },
      }).success,
    ).toBe(false);
  });
});
