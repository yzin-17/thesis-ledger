import { describe, expect, it, vi } from 'vitest';
import {
  fundNavSchema,
  quoteSchema,
  fundHoldingsSchema,
  barSeriesSchema,
  type BarSeriesIdentity,
  type Quote,
  type FundDisclosureEvidence,
} from '@thesis-ledger/schemas';
import { PerformanceValuationSeriesService } from '../../src/performance/performance-valuation-series.service.js';

const fundSymbol = '161725.OF';
const holdingSymbol = '600519.SH';
const at = new Date('2026-10-20T06:00:00Z');
const baseNav = fundNavSchema.parse({
  version: 3,
  symbol: fundSymbol,
  unitNav: 1,
  navDate: '2026-10-19T00:00:00Z',
  fetchedAt: at.toISOString(),
  provider: 'controlled',
  freshness: 'delayed',
});
const holdingQuote = (price: number, freshness: Quote['freshness'] = 'live') =>
  quoteSchema.parse({
    version: 3,
    symbol: holdingSymbol,
    open: 1,
    high: 2,
    low: Math.min(1, price),
    price,
    previousClose: 1,
    volume: 100,
    amount: 100,
    stale: freshness === 'stale',
    freshness,
    provider: 'controlled',
    fetchedAt: at.toISOString(),
    marketTime: at.toISOString(),
  });

// 先证明零值响应是合法 V3，避免请求内部的校验异常被消费降级吞掉而形成假通过。
holdingQuote(0);

async function sample(
  options: {
    price?: number;
    freshness?: Quote['freshness'];
    nav?: Partial<typeof baseNav>;
    secondHolding?: boolean;
    zeroHolding?: boolean;
    disclosureEvidence?: FundDisclosureEvidence;
    fetchedAt?: string;
  } = {},
) {
  const getQuote = vi.fn(async (symbol: string) => {
    if (symbol === '000001.SZ') return { ...holdingQuote(1.2), symbol };
    return holdingQuote(options.price ?? 0, options.freshness);
  });
  const readChartV3 = vi.fn(async (input: { identity: BarSeriesIdentity }) => {
    const current = input.identity.symbol === '000001.SZ' ? 1.2 : (options.price ?? 0);
    const points = [
      ['2026-10-19', 1],
      ['2026-10-20', current],
    ].map(([day, close]) => ({
      timestamp: `${day}T00:00:00Z`,
      open: close,
      high: close,
      low: close,
      close,
      volume: 100,
      amount: 100,
      completionStatus: 'complete',
      availableAt: at.toISOString(),
    }));
    return barSeriesSchema.parse({
      contractVersion: 3,
      identity: input.identity,
      points,
      coverage: {
        actualStart: points[0]!.timestamp,
        actualEnd: points[1]!.timestamp,
        hasMoreBefore: false,
        latestCompleteTradingDate: '2026-10-20',
      },
      provenance: {
        providerId: 'controlled',
        upstreamSource: 'controlled',
        routeIndex: 0,
        effectivePolicyRevision: 1,
        providerRevision: 'fixed',
        fetchedAt: at.toISOString(),
        freshUntil: at.toISOString(),
        servedFromCache: false,
        cacheStatus: 'miss',
      },
      inputFingerprint: 'controlled-qfq',
      chartContextV3: {
        purpose: 'interactive-chart',
        requestedStart: '2026-10-12',
        requestedEnd: '2026-10-20',
        acquisitionFingerprint: 'controlled',
        sourcePriceBasis: {
          adjustment: input.identity.adjustment,
          method: 'provider-native',
          methodVersion: 'controlled',
          basisScope: 'provider-defined',
          anchor: null,
          revision: { origin: 'provider', id: 'fixed' },
          observedAt: at.toISOString(),
          volumeBasis: 'unknown',
          dividendMeaning: 'provider-defined',
          dividendEvidenceRef: null,
          conversionAvailable: false,
          conversionEvidenceRef: null,
          derivation: null,
        },
      },
    });
  });
  const upsert = vi.fn(async ({ create }: { create: Record<string, unknown> }) => create);
  const holdings = options.secondHolding
    ? [
        { symbol: holdingSymbol, name: '一', weight: 0.4 },
        { symbol: '000001.SZ', name: '二', weight: 0.3 },
      ]
    : [{ symbol: holdingSymbol, name: '一', weight: 1 }];
  if (options.zeroHolding) holdings.push({ symbol: '000001.SZ', name: '零权重', weight: 0 });
  const service = new PerformanceValuationSeriesService(
    {
      account: { findMany: vi.fn(async () => [{ id: 'owned-fund' }]) },
      position: { findMany: vi.fn(async () => [{ symbol: fundSymbol, quantity: 100 }]) },
      accountValuationPoint: { upsert },
    } as never,
    {
      layers: vi.fn(async () => ({
        account: [{ accountId: 'owned-fund', marketValue: 100, cashValue: 10, partial: false }],
      })),
    } as never,
    {} as never,
    {
      getFundNav: vi.fn(async () => fundNavSchema.parse({ ...baseNav, ...options.nav })),
      getFundHoldings: vi.fn(async () =>
        fundHoldingsSchema.parse({
          version: 3,
          fundSymbol,
          reportPeriod: '2026-Q3',
          disclosureDate: options.disclosureEvidence ? null : '2026-10-19T00:00:00Z',
          disclosureEvidence: options.disclosureEvidence,
          provider: 'controlled',
          fetchedAt: options.fetchedAt ?? at.toISOString(),
          evidenceVersion:
            options.disclosureEvidence?.status === 'matched'
              ? options.disclosureEvidence.holdingsDigest
              : 'controlled',
          holdings,
        }),
      ),
      getQuote,
    } as never,
    { readChartV3 } as never,
  );
  await service.sample(at);
  return { point: upsert.mock.calls[0]![0].create, getQuote, readChartV3 };
}

describe('基金盘中价格可用性', () => {
  it.each([{ price: 0 }, { price: 0, freshness: 'unknown' as const }])(
    '不可定价底层证券保持原值、披露权重和低覆盖 %j',
    async (input) => {
      const { point } = await sample(input);
      expect(point).toMatchObject({
        marketValue: 100,
        totalValue: 110,
        disclosureCoverage: 1,
        pricedCoverage: 0,
        dataQuality: 'LOW_COVERAGE',
      });
    },
  );

  it.each([{ unitNav: 0 }, { freshness: 'unavailable' as const }])(
    '不可用锚点不计算调整或请求底层证券 %j',
    async (nav) => {
      const { point, getQuote } = await sample({ price: 1.2, nav });
      expect(point).toMatchObject({
        marketValue: 100,
        pricedCoverage: 0,
        dataQuality: 'LOW_COVERAGE',
      });
      expect(getQuote).not.toHaveBeenCalled();
    },
  );

  it('部分披露和部分缺价不放大，只有有效证券贡献变动和覆盖', async () => {
    const { point } = await sample({ secondHolding: true });
    expect(point.marketValue).toBeCloseTo(106);
    expect(point.disclosureCoverage).toBeCloseTo(0.7);
    expect(point.pricedCoverage).toBeCloseTo(0.3);
    expect(point.dataQuality).toBe('LOW_COVERAGE');
  });

  it('有限正价格保留有效估算和完整覆盖', async () => {
    const { point } = await sample({ price: 1.2 });
    expect(point).toMatchObject({
      marketValue: 120,
      totalValue: 130,
      disclosureCoverage: 1,
      pricedCoverage: 1,
      dataQuality: 'COMPLETE',
    });
  });

  it('原允许的陈旧且正数证据仍可估算，不扩展成陈旧读取禁令', async () => {
    const { point } = await sample({ price: 1.2, freshness: 'stale', nav: { freshness: 'stale' } });
    expect(point).toMatchObject({ marketValue: 120, pricedCoverage: 1 });
  });

  it('零权重不请求报价/锚价，披露比例不被补成正数', async () => {
    const { point, getQuote, readChartV3 } = await sample({ price: 1.2, zeroHolding: true });
    expect(point).toMatchObject({ marketValue: 120, disclosureCoverage: 1, pricedCoverage: 1 });
    expect(getQuote).toHaveBeenCalledTimes(1);
    expect(readChartV3).toHaveBeenCalledTimes(1);
  });
});

const matchedDisclosure = (): Extract<FundDisclosureEvidence, { status: 'matched' }> => ({
  status: 'matched',
  fundSymbol,
  reportPeriod: '2026-Q3',
  issuer: '受控合同样本',
  precision: 'DATE_ONLY',
  publishedOn: '2026-10-19',
  timezone: 'Asia/Shanghai',
  referenceObservedAt: '2026-10-20T05:59:00.000Z',
  availableAt: '2026-10-20T05:59:00.000Z',
  referenceVersion: 'a'.repeat(64),
  holdingsDigest: 'b'.repeat(64),
  matchedCount: 1,
  referenceCount: 74,
  algorithm: 'exact_symbol_weight_v1',
  sources: [
    { role: 'report', url: 'https://example.invalid/report', sha256: 'c'.repeat(64) },
    { role: 'publication_notice', url: 'https://example.invalid/notice', sha256: 'd'.repeat(64) },
  ],
});

describe('基金日期型披露的实际分钟消费', () => {
  it('匹配且已过保守边界才能估算，同时保留精确时间未知', async () => {
    const { point } = await sample({ price: 1.2, disclosureEvidence: matchedDisclosure() });
    expect(point).toMatchObject({
      marketValue: 120,
      dataQuality: 'COMPLETE',
      evidence: {
        funds: [
          {
            disclosureDate: null,
            disclosureAvailableAt: '2026-10-20T05:59:00.000Z',
            disclosureEvidence: { publishedOn: '2026-10-19', precision: 'DATE_ONLY' },
          },
        ],
      },
    });
  });

  it.each(['publication-day', 'later-reference', 'mismatch'])(
    '未达到日期/核对边界或失配时不请求底层证券 %s',
    async (kind) => {
      let proof: FundDisclosureEvidence = matchedDisclosure();
      if (kind === 'publication-day')
        proof = {
          ...proof,
          publishedOn: '2026-10-20',
          referenceObservedAt: '2026-10-20T02:00:00.000Z',
          availableAt: '2026-10-20T16:00:00.000Z',
        };
      else if (kind === 'later-reference')
        proof = {
          ...proof,
          referenceObservedAt: '2026-10-20T06:01:00.000Z',
          availableAt: '2026-10-20T06:01:00.000Z',
        };
      else
        proof = {
          status: 'unavailable',
          reasonCode: 'holdings_mismatch',
          fundSymbol,
          reportPeriod: '2026-Q3',
          referenceVersion: 'a'.repeat(64),
        };
      const { point, getQuote, readChartV3 } = await sample({
        price: 1.2,
        disclosureEvidence: proof,
        fetchedAt: '2026-10-20T06:02:00Z',
      });
      expect(point).toMatchObject({
        marketValue: 100,
        pricedCoverage: 0,
        dataQuality: 'LOW_COVERAGE',
      });
      expect(getQuote).not.toHaveBeenCalled();
      expect(readChartV3).not.toHaveBeenCalled();
    },
  );
});
