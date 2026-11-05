import { BadRequestException, Inject, Injectable, Optional } from '@nestjs/common';
import { openTradingMarketsAt } from '@thesis-ledger/domain';
import { fundValuationSchema, fundValuationSymbolSchema, fundValuationTodaySchema, type FundValuation } from '@thesis-ledger/schemas';
import { MarketService } from './market.service.js';
import { MarketBarReader } from './market-bar-reader.js';
import { FundValuationError, readFundNavEstimate } from './fund-nav-estimator.js';
import { FundValuationPointRepository, fundValuationDay } from './fund-valuation-point.repository.js';
import { PrismaService } from '../platform/prisma.service.js';

type Calculation = { value: FundValuation; evidence: unknown };

@Injectable()
export class MarketFundValuationService {
  private readonly flights = new Map<string, Promise<FundValuation>>();

  constructor(
    @Inject(MarketService) private readonly market: MarketService,
    @Inject(MarketBarReader) private readonly bars: MarketBarReader,
    @Optional() @Inject(FundValuationPointRepository) private readonly points?: FundValuationPointRepository,
    @Optional() @Inject(PrismaService) private readonly prisma?: PrismaService,
  ) {}

  async today(symbol: string, at = new Date()) {
    await this.current(symbol, at);
    const points = await this.points?.today(symbol, at) ?? [];
    return fundValuationTodaySchema.parse({
      version: 1, symbol, date: fundValuationDay(at), timezone: 'Asia/Shanghai', asOf: at.toISOString(), points,
    });
  }

  current(symbol: string, at = new Date()): Promise<FundValuation> {
    if (!fundValuationSymbolSchema.safeParse(symbol).success)
      throw new BadRequestException('需要完整场外基金代码');
    const key = `${symbol}:${Math.floor(at.getTime() / 60_000)}`;
    const existing = this.flights.get(key);
    if (existing) return existing;
    // 成功后仍通过底层受控缓存复核来源，避免整结果缓存绕过来源开关。
    const pending = this.calculate(symbol, at).then(async ({ value, evidence }) => {
      if (value.marketState === 'open' && this.points) await this.points.record(value, at, evidence);
      return value;
    }).finally(() => this.flights.delete(key));
    this.flights.set(key, pending);
    return pending;
  }

  private async calculate(symbol: string, at: Date): Promise<Calculation> {
    const marketState = openTradingMarketsAt(at).includes('CN') ? 'open' : 'closed';
    const base: FundValuation = {
      version: 1, symbol, marketState, quality: 'unavailable',
      estimatedNav: null, changePercent: null, anchor: null, estimatedAt: null, oldestPriceAt: null,
      disclosureCoverage: 0, pricedCoverage: 0, reasons: [], method: 'disclosed-holdings-qfq-v1',
    };
    if (marketState === 'closed') {
      const last = await this.points?.latest(symbol, at);
      const value = last ? { ...last, marketState, reasons: ['market_closed', ...last.reasons] }
        : { ...base, reasons: ['market_closed'] };
      return { value: fundValuationSchema.parse(value), evidence: null };
    }
    try {
      const currency = await this.currencyProof(symbol);
      const { nav, estimate, evidence } = await readFundNavEstimate({ symbol, at, market: this.market, bars: this.bars, current: true });
      if (await this.currencyProof(symbol) !== currency) throw new FundValuationError('currency_unverified');
      const anchor = { unitNav: nav.unitNav, navDate: nav.navDate };
      const coverage = { disclosureCoverage: estimate.disclosureCoverage, pricedCoverage: estimate.pricedCoverage };
      if (estimate.pricedCoverage === 0)
        return { value: fundValuationSchema.parse({ ...base, ...coverage, anchor, reasons: ['prices_unavailable'] }), evidence };
      let quality: FundValuation['quality'] = 'complete';
      let reasons: FundValuation['reasons'] = [];
      if (estimate.pricedCoverage < 0.5) {
        quality = 'low_coverage'; reasons = ['low_coverage'];
      } else if (estimate.pricedCoverage < 0.999999) {
        quality = 'partial'; reasons = ['partial_coverage'];
      }
      const times = evidence.holdingPrices.filter((price) => price.status === 'available')
        .flatMap((price) => price.quoteMarketTime ? [price.quoteMarketTime] : []).sort();
      return { value: fundValuationSchema.parse({
        ...base, ...coverage, anchor, quality, reasons,
        estimatedNav: estimate.estimatedNav,
        changePercent: (estimate.estimatedNav / nav.unitNav - 1) * 100,
        estimatedAt: at.toISOString(), oldestPriceAt: times[0] ?? null,
      }), evidence };
    } catch (error) {
      const reason = error instanceof FundValuationError ? error.reason : 'source_unavailable';
      return { value: fundValuationSchema.parse({ ...base, reasons: [reason] }), evidence: { reason } };
    }
  }

  private async currencyProof(symbol: string) {
    const association = await this.prisma?.instrumentAssetAssociation.findUnique({ where: { symbol }, include: { asset: true } });
    if (!association || association.status !== 'active' || !association.confirmedAt ||
        association.asset.identityStatus !== 'confirmed' || association.asset.assetType !== 'fund')
      throw new FundValuationError('currency_unverified');
    if (association.asset.currency !== 'CNY') throw new FundValuationError('currency_unsupported');
    return `${association.instrumentId}:${association.confirmedAt.toISOString()}:${association.asset.updatedAt.toISOString()}`;
  }
}
