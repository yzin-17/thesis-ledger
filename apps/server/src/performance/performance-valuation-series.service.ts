import { BadRequestException, Injectable } from '@nestjs/common';
import { assetMarketsByTradingMarket, openTradingMarketsAt } from '@thesis-ledger/domain';
import type {
  FundHoldingsV1,
  PerformanceSeriesInterval,
  PerformanceSeriesRange,
} from '@thesis-ledger/schemas';
import { MarketService } from '../market/market.service.js';
import { PrismaService } from '../platform/prisma.service.js';
import { investmentAccountWhere } from '../portfolio/investment-account-scope.js';
import { PerformanceLayerService } from './performance-layer.service.js';
import { PerformanceSnapshotService } from './performance-snapshot.service.js';
import type { Currency, PortfolioMode } from './performance-types.js';

const intervalMatrix: Record<PerformanceSeriesRange, readonly PerformanceSeriesInterval[]> = {
  '1D': ['1min', '1h'],
  '5D': ['1min', '1h', '1d'],
  '1M': ['1h', '1d', '1w'],
  '3M': ['1h', '1d', '1w', '1mo'],
  YTD: ['1d', '1w', '1mo'],
  '1Y': ['1d', '1w', '1mo'],
  '5Y': ['1w', '1mo', '1y'],
  ALL: ['1mo', '1y'],
};

export const performanceSeriesDefaultInterval: Record<
  PerformanceSeriesRange,
  PerformanceSeriesInterval
> = {
  '1D': '1min',
  '5D': '1h',
  '1M': '1d',
  '3M': '1d',
  YTD: '1d',
  '1Y': '1d',
  '5Y': '1mo',
  ALL: '1mo',
};

type SeriesPoint = {
  at: string;
  value: number;
  currency: Currency;
  valuationBasis: 'ESTIMATED' | 'OFFICIAL';
  disclosureCoverage: number;
  pricedCoverage: number;
  dataQuality: 'COMPLETE' | 'PARTIAL' | 'LOW_COVERAGE' | 'UNAVAILABLE';
  sourceSnapshotId: string | null;
};

export const estimateFundNavFromHoldings = (
  anchorNav: number,
  holdings: FundHoldingsV1['holdings'],
  returns: ReadonlyMap<string, number>,
) => {
  let contribution = 0;
  let pricedCoverage = 0;
  for (const holding of holdings) {
    const change = returns.get(holding.symbol);
    if (change === undefined || !Number.isFinite(change)) continue;
    contribution += holding.weight * change;
    pricedCoverage += holding.weight;
  }
  const disclosureCoverage = holdings.reduce((total, holding) => total + holding.weight, 0);
  return {
    estimatedNav: anchorNav * (1 + contribution),
    disclosureCoverage,
    pricedCoverage,
  };
};

const rangeStart = (range: PerformanceSeriesRange, now: Date) => {
  if (range === 'ALL') return undefined;
  if (range === 'YTD') return new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  const duration: Record<Exclude<PerformanceSeriesRange, 'ALL' | 'YTD'>, number> = {
    '1D': 24 * 60 * 60 * 1000,
    '5D': 5 * 24 * 60 * 60 * 1000,
    '1M': 31 * 24 * 60 * 60 * 1000,
    '3M': 93 * 24 * 60 * 60 * 1000,
    '1Y': 366 * 24 * 60 * 60 * 1000,
    '5Y': 5 * 366 * 24 * 60 * 60 * 1000,
  };
  return new Date(now.getTime() - duration[range]);
};

const shanghaiParts = (value: Date) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(value);
  return Object.fromEntries(parts.map((part) => [part.type, part.value])) as Record<string, string>;
};

const bucketKey = (at: string, interval: PerformanceSeriesInterval) => {
  const parts = shanghaiParts(new Date(at));
  const year = parts.year ?? '0000';
  const month = parts.month ?? '00';
  const dayOfMonth = parts.day ?? '00';
  const hour = parts.hour ?? '00';
  const minute = parts.minute ?? '00';
  const date = `${year}-${month}-${dayOfMonth}`;
  if (interval === '1min') return `${date}T${hour}:${minute}`;
  if (interval === '1h') return `${date}T${hour}`;
  if (interval === '1d') return date;
  if (interval === '1mo') return `${year}-${month}`;
  if (interval === '1y') return year;
  const day = new Date(`${date}T00:00:00.000Z`);
  const weekday = day.getUTCDay() || 7;
  day.setUTCDate(day.getUTCDate() - weekday + 1);
  return day.toISOString().slice(0, 10);
};

const resample = (points: SeriesPoint[], interval: PerformanceSeriesInterval) => {
  const buckets = new Map<string, SeriesPoint>();
  for (const point of points) buckets.set(bucketKey(point.at, interval), point);
  return [...buckets.values()].slice(-2000);
};

@Injectable()
export class PerformanceValuationSeriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly layers: PerformanceLayerService,
    private readonly snapshots: PerformanceSnapshotService,
    private readonly market: MarketService,
  ) {}

  private openAssetMarkets(at: Date) {
    const markets = openTradingMarketsAt(at);
    return {
      markets,
      assetMarkets: markets.flatMap((market) => assetMarketsByTradingMarket[market]),
    };
  }

  private samplingAccountWhere(mode: PortfolioMode, assetMarkets: readonly string[]) {
    return {
      ...investmentAccountWhere(mode),
      positions: {
        some: {
          quantity: { gt: 0 },
          asset: { market: { in: [...assetMarkets] } },
        },
      },
    };
  }

  async scheduledSamplingGate(at = new Date(), mode: PortfolioMode = 'actual') {
    const { markets, assetMarkets } = this.openAssetMarkets(at);
    if (markets.length === 0) {
      return { allowed: false, reason: '当前没有处于常规交易时段的支持市场' } as const;
    }
    const account = await this.prisma.account.findFirst({
      where: this.samplingAccountWhere(mode, assetMarkets),
      select: { id: true },
    });
    if (!account) {
      return {
        allowed: false,
        reason: `当前开放市场（${markets.join('/')}）没有实际持仓`,
      } as const;
    }
    return { allowed: true, markets } as const;
  }

  async sample(
    at = new Date(),
    mode: PortfolioMode = 'actual',
    baseCurrency: Currency = 'CNY',
    options: { marketGate?: boolean } = {},
  ) {
    const sampledAt = new Date(at);
    sampledAt.setUTCSeconds(0, 0);
    const openMarkets = options.marketGate ? this.openAssetMarkets(at) : undefined;
    const accounts = await this.prisma.account.findMany({
      where: openMarkets
        ? this.samplingAccountWhere(mode, openMarkets.assetMarkets)
        : investmentAccountWhere(mode),
      select: { id: true },
    });
    const sampled = [];
    for (const account of accounts) {
      const result = await this.layers.layers(account.id, undefined, mode, {
        fxMerge: true,
        baseCurrency,
      });
      const value = result.account.find((item) => item.accountId === account.id);
      if (!value || value.marketValue === null || value.cashValue === null) continue;
      const funds = await this.estimatedFundAdjustments(account.id, sampledAt);
      const marketValue = value.marketValue + funds.marketValueAdjustment;
      let quality: 'COMPLETE' | 'PARTIAL' | 'LOW_COVERAGE' = value.partial ? 'PARTIAL' : 'COMPLETE';
      if (funds.hasFunds && funds.pricedCoverage < 0.5) quality = 'LOW_COVERAGE';
      let pricedCoverage = funds.pricedCoverage;
      if (!funds.hasFunds) pricedCoverage = value.partial ? 0 : 1;
      const disclosureCoverage = funds.hasFunds ? funds.disclosureCoverage : 1;
      sampled.push(
        await this.prisma.accountValuationPoint.upsert({
          where: {
            accountId_mode_at_baseCurrency: {
              accountId: account.id,
              mode,
              at: sampledAt,
              baseCurrency,
            },
          },
          create: {
            accountId: account.id,
            mode,
            at: sampledAt,
            baseCurrency,
            marketValue,
            cashValue: value.cashValue,
            totalValue: marketValue + value.cashValue,
            valuationBasis: 'ESTIMATED',
            disclosureCoverage,
            pricedCoverage,
            dataQuality: quality,
            evidence: {
              missingSymbols: value.missingSymbols,
              missingCurrencies: value.missingCurrencies,
              funds: funds.evidence,
            },
          },
          update: {
            marketValue,
            cashValue: value.cashValue,
            totalValue: marketValue + value.cashValue,
            disclosureCoverage,
            pricedCoverage,
            dataQuality: quality,
            evidence: {
              missingSymbols: value.missingSymbols,
              missingCurrencies: value.missingCurrencies,
              funds: funds.evidence,
            },
          },
        }),
      );
    }
    const disclosureCoverage =
      sampled.length > 0
        ? Math.min(...sampled.map((point) => Number(point.disclosureCoverage)))
        : null;
    const pricedCoverage =
      sampled.length > 0 ? Math.min(...sampled.map((point) => Number(point.pricedCoverage))) : null;
    return {
      at: sampledAt.toISOString(),
      sampled: sampled.length,
      disclosureCoverage,
      pricedCoverage,
      partial: sampled.some((point) => point.dataQuality !== 'COMPLETE'),
      ...(openMarkets ? { openMarkets: openMarkets.markets } : {}),
    };
  }

  async series(input: {
    scope: 'account' | 'portfolio';
    accountId?: string;
    range: PerformanceSeriesRange;
    interval: PerformanceSeriesInterval;
    mode: PortfolioMode;
    baseCurrency: Currency;
  }) {
    const availableIntervals = intervalMatrix[input.range].filter(
      (interval) => input.mode === 'actual' || !['1min', '1h'].includes(interval),
    );
    if (!availableIntervals.includes(input.interval)) {
      throw new BadRequestException({
        code: 'UNSUPPORTED_SERIES_INTERVAL',
        message: '当前区间不支持所选粒度，请选择可用粒度',
        availableIntervals,
        defaultInterval: performanceSeriesDefaultInterval[input.range],
      });
    }
    const now = new Date();
    const start = rangeStart(input.range, now);
    const points = ['1min', '1h'].includes(input.interval)
      ? await this.intradayPoints(input, start)
      : await this.dailyPoints(input, start);
    const sampled = resample(points, input.interval);
    const qualities = new Set(sampled.map((point) => point.dataQuality));
    let dataQuality: SeriesPoint['dataQuality'] = 'COMPLETE';
    if (qualities.has('UNAVAILABLE')) dataQuality = 'UNAVAILABLE';
    else if (qualities.has('LOW_COVERAGE')) dataQuality = 'LOW_COVERAGE';
    else if (qualities.has('PARTIAL')) dataQuality = 'PARTIAL';
    return {
      range: input.range,
      interval: input.interval,
      currency: input.baseCurrency,
      availableIntervals,
      defaultInterval: performanceSeriesDefaultInterval[input.range],
      dataQuality,
      historyStart: sampled[0]?.at ?? null,
      points: sampled,
    };
  }

  private async intradayPoints(
    input: {
      scope: 'account' | 'portfolio';
      accountId?: string;
      mode: PortfolioMode;
      baseCurrency: Currency;
    },
    start?: Date,
  ): Promise<SeriesPoint[]> {
    const rows = await this.prisma.accountValuationPoint.findMany({
      where: {
        mode: input.mode,
        baseCurrency: input.baseCurrency,
        ...(input.accountId ? { accountId: input.accountId } : {}),
        ...(start ? { at: { gte: start } } : {}),
        ...(input.scope === 'portfolio' ? { account: investmentAccountWhere(input.mode) } : {}),
      },
      orderBy: { at: 'asc' },
      take: 10_000,
    });
    if (input.scope === 'account') {
      return rows.map((row) => ({
        at: row.at.toISOString(),
        value: Number(row.totalValue),
        currency: input.baseCurrency,
        valuationBasis: row.valuationBasis as SeriesPoint['valuationBasis'],
        disclosureCoverage: Number(row.disclosureCoverage),
        pricedCoverage: Number(row.pricedCoverage),
        dataQuality: row.dataQuality as SeriesPoint['dataQuality'],
        sourceSnapshotId: row.sourceSnapshotId,
      }));
    }
    const grouped = new Map<string, typeof rows>();
    for (const row of rows) {
      const key = row.at.toISOString();
      const values = grouped.get(key) ?? [];
      values.push(row);
      grouped.set(key, values);
    }
    return [...grouped.entries()].map(([at, values]) => ({
      at,
      value: values.reduce((total, row) => total + Number(row.totalValue), 0),
      currency: input.baseCurrency,
      valuationBasis: 'ESTIMATED',
      disclosureCoverage: Math.min(...values.map((row) => Number(row.disclosureCoverage))),
      pricedCoverage: Math.min(...values.map((row) => Number(row.pricedCoverage))),
      dataQuality: values.every((row) => row.dataQuality === 'COMPLETE') ? 'COMPLETE' : 'PARTIAL',
      sourceSnapshotId: null,
    }));
  }

  private async dailyPoints(
    input: {
      accountId?: string;
      mode: PortfolioMode;
      baseCurrency: Currency;
    },
    start?: Date,
  ): Promise<SeriesPoint[]> {
    const rows = await this.snapshots.history(
      input.accountId,
      start?.toISOString(),
      undefined,
      input.mode,
      { fxMerge: true, baseCurrency: input.baseCurrency },
    );
    return rows.map((row) => {
      const partial =
        row.payload !== null &&
        typeof row.payload === 'object' &&
        'partial' in row.payload &&
        row.payload.partial === true;
      let pricedCoverage = partial ? 0 : 1;
      if ('pricedCoverage' in row) pricedCoverage = Number(row.pricedCoverage ?? pricedCoverage);
      return {
        at: row.capturedAt.toISOString(),
        value: Number(row.marketValue) + Number(row.cashValue),
        currency: row.currency ?? input.baseCurrency,
        valuationBasis: 'valuationBasis' in row ? (row.valuationBasis ?? 'ESTIMATED') : 'ESTIMATED',
        disclosureCoverage: 'disclosureCoverage' in row ? Number(row.disclosureCoverage ?? 1) : 1,
        pricedCoverage,
        dataQuality: partial ? 'PARTIAL' : 'COMPLETE',
        sourceSnapshotId: row.id ?? null,
      };
    });
  }

  private async estimatedFundAdjustments(accountId: string, at: Date) {
    const positions = await this.prisma.position.findMany({
      where: { accountId, asset: { assetType: 'fund' } },
      select: { symbol: true, quantity: true },
    });
    if (positions.length === 0) {
      return {
        hasFunds: false,
        marketValueAdjustment: 0,
        disclosureCoverage: 1,
        pricedCoverage: 1,
        evidence: [],
      };
    }
    const estimates = await Promise.all(
      positions.map(async (position) => {
        try {
          const [nav, holdings] = await Promise.all([
            this.market.getFundNav(position.symbol, { allowStale: true }),
            this.market.getFundHoldings(position.symbol),
          ]);
          if (new Date(holdings.disclosureDate) > at) throw new Error('披露证据晚于估值时点');
          const anchorStart = new Date(nav.navDate);
          anchorStart.setUTCDate(anchorStart.getUTCDate() - 7);
          const returns = new Map<string, number>();
          await Promise.all(
            holdings.holdings.map(async (holding) => {
              try {
                const [quote, bars] = await Promise.all([
                  this.market.getQuote(holding.symbol, { allowStale: true }),
                  this.market.getBars(
                    holding.symbol,
                    '1d',
                    { start: anchorStart.toISOString(), end: nav.navDate },
                    { allowStale: true },
                  ),
                ]);
                const anchor = bars.at(-1);
                if (!anchor || anchor.close <= 0) return;
                returns.set(holding.symbol, quote.price / anchor.close - 1);
              } catch {
                // 未定价持仓按零变动处理，覆盖率由结果显式反映。
              }
            }),
          );
          const estimate = estimateFundNavFromHoldings(nav.unitNav, holdings.holdings, returns);
          return {
            adjustment: Number(position.quantity) * (estimate.estimatedNav - nav.unitNav),
            disclosureCoverage: estimate.disclosureCoverage,
            pricedCoverage: estimate.pricedCoverage,
            evidence: {
              symbol: position.symbol,
              anchorNav: nav.unitNav,
              anchorDate: nav.navDate,
              estimatedNav: estimate.estimatedNav,
              reportPeriod: holdings.reportPeriod,
              disclosureDate: holdings.disclosureDate,
              evidenceVersion: holdings.evidenceVersion,
              disclosureCoverage: estimate.disclosureCoverage,
              pricedCoverage: estimate.pricedCoverage,
            },
          };
        } catch (error) {
          return {
            adjustment: 0,
            disclosureCoverage: 0,
            pricedCoverage: 0,
            evidence: {
              symbol: position.symbol,
              error: error instanceof Error ? error.message : '基金持仓估值不可用',
            },
          };
        }
      }),
    );
    return {
      hasFunds: true,
      marketValueAdjustment: estimates.reduce((total, item) => total + item.adjustment, 0),
      disclosureCoverage: Math.min(...estimates.map((item) => item.disclosureCoverage)),
      pricedCoverage: Math.min(...estimates.map((item) => item.pricedCoverage)),
      evidence: estimates.map((item) => item.evidence),
    };
  }
}
