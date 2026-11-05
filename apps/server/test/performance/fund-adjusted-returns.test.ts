import { describe, expect, it, vi } from 'vitest';
import {
  barSeriesSchema,
  quoteSchema,
  fundNavSchema,
  fundHoldingsSchema,
  type BarSeriesIdentity,
} from '@thesis-ledger/schemas';
import { PerformanceValuationSeriesService } from '../../src/performance/performance-valuation-series.service.js';

const symbol = '600519.SH';
const defaultAt = new Date('2026-10-20T06:00:00Z');
type Options = {
  rawQuote?: number;
  rawAnchor?: number;
  adjustedAnchor?: number;
  adjustedCurrent?: number;
  at?: Date;
  quoteAt?: string | null;
  anchorDay?: string;
  currentDay?: string;
  missingAnchor?: boolean;
  missingCurrent?: boolean;
  missingBasis?: boolean;
  wrongIdentity?: boolean;
  futurePrice?: boolean;
  timezonePoint?: boolean;
  wrongQuoteIdentity?: boolean;
  wrongAdjustment?: boolean;
  futureBasis?: boolean;
};

async function sample(options: Options = {}) {
  const at = options.at ?? defaultAt;
  const anchorDay = options.anchorDay ?? '2026-10-19';
  const currentDay = options.currentDay ?? '2026-10-20';
  const quote = quoteSchema.parse({
    version: 3,
    symbol: options.wrongQuoteIdentity ? '000001.SZ' : symbol,
    price: options.rawQuote ?? 50,
    open: 100,
    high: 200,
    low: 0,
    previousClose: 100,
    volume: 100,
    amount: 100,
    stale: false,
    freshness: 'live',
    provider: 'controlled',
    fetchedAt: at.toISOString(),
    marketTime: options.quoteAt === undefined ? at.toISOString() : options.quoteAt,
  });
  const makeSeries = (identity: BarSeriesIdentity, end: string | undefined) => {
    const adjusted = identity.adjustment === 'qfq';
    const points = [
      {
        day: anchorDay,
        close: adjusted ? (options.adjustedAnchor ?? 50) : (options.rawAnchor ?? 100),
      },
      {
        day: currentDay,
        close: adjusted ? (options.adjustedCurrent ?? 50) : (options.rawQuote ?? 50),
      },
    ]
      .filter(
        (p, index) =>
          (!adjusted || !(index === 0 ? options.missingAnchor : options.missingCurrent)) &&
          (!end || p.day <= end.slice(0, 10)),
      )
      .map(({ day, close }) => ({
        timestamp: `${day}T00:00:00${options.timezonePoint ? '+08:00' : 'Z'}`,
        open: close,
        high: close,
        low: close,
        close,
        volume: 100,
        amount: 100,
        completionStatus: 'complete' as const,
        availableAt:
          options.futurePrice && adjusted
            ? new Date(at.getTime() + 120_000).toISOString()
            : at.toISOString(),
      }));
    return barSeriesSchema.parse({
      contractVersion: 3,
      identity: options.wrongIdentity && adjusted ? { ...identity, symbol: '000001.SZ' } : identity,
      points,
      coverage: {
        actualStart: points[0]?.timestamp ?? null,
        actualEnd: points.at(-1)?.timestamp ?? null,
        hasMoreBefore: false,
        latestCompleteTradingDate: currentDay,
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
      inputFingerprint: `fixed-${identity.adjustment}`,
      ...(options.missingBasis && adjusted
        ? {}
        : {
            chartContextV3: {
              purpose: 'interactive-chart',
              requestedStart: '2026-10-01',
              requestedEnd: currentDay,
              acquisitionFingerprint: 'fixed',
              sourcePriceBasis: {
                adjustment: options.wrongAdjustment && adjusted ? 'none' : identity.adjustment,
                method: 'provider-native',
                methodVersion: 'controlled',
                basisScope: 'provider-defined',
                anchor: null,
                revision: { origin: 'provider', id: 'fixed' },
                observedAt:
                  options.futureBasis && adjusted
                    ? new Date(at.getTime() + 120_000).toISOString()
                    : at.toISOString(),
                volumeBasis: 'unknown',
                dividendMeaning: 'provider-defined',
                dividendEvidenceRef: null,
                conversionAvailable: false,
                conversionEvidenceRef: null,
                derivation: null,
              },
            },
          }),
    });
  };
  const readChartV3 = vi.fn(
    async (input: { identity: BarSeriesIdentity; window: { end?: string } }) =>
      makeSeries(input.identity, input.window.end),
  );
  const getQuote = vi.fn(async () => quote);
  const upsert = vi.fn(async ({ create }: { create: Record<string, unknown> }) => create);
  const service = new PerformanceValuationSeriesService(
    {
      account: { findMany: vi.fn(async () => [{ id: 'owned' }]) },
      position: { findMany: vi.fn(async () => [{ symbol: '161725.OF', quantity: 100 }]) },
      accountValuationPoint: { upsert },
    } as never,
    {
      layers: vi.fn(async () => ({
        account: [{ accountId: 'owned', marketValue: 100, cashValue: 0, partial: false }],
      })),
    } as never,
    {} as never,
    {
      getFundNav: vi.fn(async () =>
        fundNavSchema.parse({
          version: 3,
          symbol: '161725.OF',
          unitNav: 1,
          navDate: anchorDay + 'T00:00:00Z',
          freshness: 'delayed',
          provider: 'controlled',
          fetchedAt: at.toISOString(),
        }),
      ),
      getFundHoldings: vi.fn(async () =>
        fundHoldingsSchema.parse({
          version: 3,
          fundSymbol: '161725.OF',
          provider: 'controlled',
          fetchedAt: at.toISOString(),
          disclosureDate: '2026-09-01T00:00:00Z',
          reportPeriod: '2026-Q2',
          evidenceVersion: 'known',
          holdings: [{ symbol, name: '实际披露', weight: 1 }],
        }),
      ),
      getQuote,
    } as never,
    { readChartV3 } as never,
  );
  await service.sample(at);
  return { point: upsert.mock.calls[0]![0].create, readChartV3, getQuote };
}

describe('基金分钟估算的同序列复权价格', () => {
  it.each([
    { name: '拆股', rawQuote: 50, adjustedAnchor: 50, adjustedCurrent: 50 },
    { name: '分红', rawQuote: 90, adjustedAnchor: 90, adjustedCurrent: 90 },
    { name: '供应商全局坐标缩放', rawQuote: 90, adjustedAnchor: 9, adjustedCurrent: 9 },
  ])('$name 不把原价坐标变化记成基金损失', async (input) => {
    const { point, readChartV3 } = await sample(input);
    expect(point.marketValue).toBeCloseTo(100);
    expect(point.pricedCoverage).toBe(1);
    expect(readChartV3).toHaveBeenCalledWith(
      expect.objectContaining({ identity: expect.objectContaining({ adjustment: 'qfq' }) }),
    );
  });
  it('复权序列非零收益不与原价 Quote 混算', async () => {
    const { point } = await sample({ rawQuote: 60, adjustedAnchor: 5, adjustedCurrent: 6 });
    expect(point.marketValue).toBeCloseTo(120);
  });
  it.each([
    'missingAnchor',
    'missingCurrent',
    'missingBasis',
    'wrongIdentity',
    'futurePrice',
    'wrongAdjustment',
    'futureBasis',
  ] as const)('%s 保持缺价持平和低覆盖', async (key) => {
    const { point } = await sample({ [key]: true });
    expect(point).toMatchObject({
      marketValue: 100,
      pricedCoverage: 0,
      dataQuality: 'LOW_COVERAGE',
    });
  });
  it('未知 Quote 市场时刻不以抓取时刻补齐', async () => {
    const { point, readChartV3 } = await sample({ quoteAt: null });
    expect(point.pricedCoverage).toBe(0);
    expect(readChartV3).not.toHaveBeenCalled();
  });
  it('错误证券的合法 Quote 不查询或混入复权数据', async () => {
    const { point, readChartV3 } = await sample({ wrongQuoteIdentity: true });
    expect(point.pricedCoverage).toBe(0);
    expect(readChartV3).not.toHaveBeenCalled();
  });
  it.each([{ adjustedAnchor: 0 }, { adjustedCurrent: 0 }])(
    '合法零复权价保持缺价而非跌至零 %j',
    async (input) => {
      const { point } = await sample(input);
      expect(point).toMatchObject({
        marketValue: 100,
        pricedCoverage: 0,
        dataQuality: 'LOW_COVERAGE',
      });
    },
  );
  it('超过当前估值分钟的未来 Quote 不请求复权价格', async () => {
    const { point, readChartV3 } = await sample({ quoteAt: '2026-10-20T06:02:00Z' });
    expect(point.pricedCoverage).toBe(0);
    expect(readChartV3).not.toHaveBeenCalled();
  });
  it.each([
    {
      name: '盘前',
      at: new Date('2026-10-20T01:00:00Z'),
      anchorDay: '2026-10-16',
      currentDay: '2026-10-19',
    },
    {
      name: '周末',
      at: new Date('2026-10-17T04:00:00Z'),
      anchorDay: '2026-10-15',
      currentDay: '2026-10-16',
    },
    {
      name: '国庆假日',
      at: new Date('2026-10-01T04:00:00Z'),
      anchorDay: '2026-09-29',
      currentDay: '2026-09-30',
    },
  ])('$name 使用上一已开市交易日', async (input) => {
    const { point, readChartV3 } = await sample(input);
    expect(point.marketValue).toBeCloseTo(100);
    expect(readChartV3).toHaveBeenCalledWith(
      expect.objectContaining({
        window: expect.objectContaining({ end: input.currentDay + 'T23:59:59.999Z' }),
      }),
    );
  });
  it('日历未覆盖年份不能猜测开市或请求价格', async () => {
    const { point, readChartV3 } = await sample({
      at: new Date('2027-01-04T06:00:00Z'),
      anchorDay: '2027-01-01',
      currentDay: '2027-01-04',
    });
    expect(point.pricedCoverage).toBe(0);
    expect(readChartV3).not.toHaveBeenCalled();
  });
  it('按市场本地日期识别带上海偏移的日线点', async () => {
    const { point } = await sample({ timezonePoint: true });
    expect(point.marketValue).toBeCloseTo(100);
  });
});
