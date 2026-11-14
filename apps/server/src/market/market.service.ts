import {
  parseCurrentChip,
} from './market-current-data.js';
import { Injectable, Optional } from '@nestjs/common';
import { normalizeSymbol } from '@thesis-ledger/domain';
import {
  fxRatesResponseSchema,
  type ChipDistribution,
  type Currency,
  type FxRatesResponse,
  type MarketQuoteIdentity,
} from '@thesis-ledger/schemas';
import { MarketObservationsService } from './market-observations.service.js';
import { readQuoteBatch } from './market-quote-batch.js';
import { DsaClient } from '../integration/dsa/dsa.client.js';
import { RedisService } from '../platform/redis.service.js';
import { PrismaService } from '../platform/prisma.service.js';
import { MarketFundReader } from './market-fund-reader.js';
import { MarketCacheControl } from './market-cache-control.js';
import { MarketRequestCoordinator } from './market-request-coordinator.js';
import { MarketQuoteReader, type QuoteReadOptions } from './market-quote-reader.js';
import { MarketSessionReader } from './market-session-reader.js';
import { MarketPeriodCalendarReader } from './market-period-calendar-reader.js';
import { DataQualityService } from '../quality/data-quality.service.js';
import type { TradingMarket } from '@thesis-ledger/domain';
import {
  MARKET_CACHE_POLICIES,
  MarketResultCache,
} from './market-result-cache.js';

@Injectable()
export class MarketService {
  private readonly quoteReader: MarketQuoteReader;
  private readonly fundReader: MarketFundReader;
  private readonly control: MarketCacheControl;
  private readonly resultCache: MarketResultCache;
  private readonly coordinator: MarketRequestCoordinator;
  private readonly sessions: MarketSessionReader;

  constructor(
    private readonly dsa: DsaClient,
    private readonly redis: RedisService,
    @Optional() private readonly prisma?: PrismaService,
    @Optional() private readonly observations?: MarketObservationsService,
    @Optional() sessions?: MarketSessionReader,
    quality?: DataQualityService,
  ) {
    this.sessions = sessions ?? new MarketSessionReader(new MarketPeriodCalendarReader(dsa, quality));
    this.quoteReader = new MarketQuoteReader(dsa, redis, this.sessions, quality);
    this.control = new MarketCacheControl(dsa);
    this.coordinator = new MarketRequestCoordinator(redis, () => dsa.timeoutMs);
    this.fundReader = new MarketFundReader(dsa, redis, this.singleFlight.bind(this),
      this.withDistributedLock.bind(this), prisma, quality);
    this.resultCache = new MarketResultCache(redis);
  }

  private singleFlight<T>(key: string, work: () => Promise<T>): Promise<T> {
    return this.coordinator.singleFlight(key, work);
  }

  private async withDistributedLock<T>(key: string, work: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    return this.coordinator.withDistributedLock(key, work, signal);
  }

  async getFxRates(input: {
    baseCurrency: Currency;
    currencies: readonly Currency[];
    asOf?: string;
  }): Promise<FxRatesResponse> {
    const currencies = [...new Set(input.currencies)].sort();
    const asOf = input.asOf?.slice(0, 10);
    const key = `fx-rates:${input.baseCurrency}:${currencies.join(',')}:${asOf ?? 'today'}`;
    return this.singleFlight(key, async () => {
      const raw = await this.dsa.fxRates({
        baseCurrency: input.baseCurrency,
        currencies,
        ...(asOf ? { asOf } : {}),
      });
      const value = fxRatesResponseSchema.parse(raw);
      await this.observations?.record({ kind: 'fx', value });
      return value;
    });
  }

  async getQuote(input: string, options: QuoteReadOptions = {}) {
    const value = await this.quoteReader.getQuote(input, options);
    await this.observations?.record({ kind: 'quote', value });
    return value;
  }

  getSession(market: TradingMarket, at = new Date(Date.now())) {
    return this.sessions.read(market, at);
  }

  getQuotes(items: readonly MarketQuoteIdentity[], options: Pick<QuoteReadOptions, 'allowStale' | 'refresh' | 'signal'> = {}) {
    return readQuoteBatch(items, (symbol, selected) => this.getQuote(symbol, selected), options);
  }

  async getFundNav(...args: Parameters<MarketFundReader['getFundNav']>) {
    const value = await this.fundReader.getFundNav(...args);
    await this.observations?.record({ kind: 'nav', value });
    return value;
  }

  /** 当前净值的原协议没有币种；只接受已确认、未变化的 CNY 基金元数据。 */
  async getFundNavWithCurrency(instrument: { instrumentId: string; symbol: string }, signal?: AbortSignal) {
    signal?.throwIfAborted();
    const proof = await this.fundCurrencyProof(instrument);
    if (!proof) return { status: 'unavailable' as const, reason: 'fund_currency_unverified' as const };
    if (proof.currency !== 'CNY') return { status: 'unavailable' as const, reason: 'fund_currency_unsupported' as const };
    signal?.throwIfAborted();
    const nav = await this.getFundNav(instrument.symbol, { allowStale: false, ...(signal ? { signal } : {}) });
    signal?.throwIfAborted();
    const current = await this.fundCurrencyProof(instrument);
    if (!current || current.currency !== 'CNY' || current.confirmedAt.getTime() !== proof.confirmedAt.getTime() || current.assetUpdatedAt.getTime() !== proof.assetUpdatedAt.getTime()) return { status: 'unavailable' as const, reason: 'fund_currency_changed' as const };
    return { status: 'available' as const, nav, currency: 'CNY' as const, currencySource: 'confirmed-asset' as const, currencyConfirmedAt: proof.confirmedAt.toISOString() };
  }

  private async fundCurrencyProof(instrument: { instrumentId: string; symbol: string }) {
    if (!this.prisma) return null;
    const association = await this.prisma.instrumentAssetAssociation.findUnique({ where: { symbol: instrument.symbol }, include: { asset: true } });
    if (!association || association.instrumentId !== instrument.instrumentId || association.status !== 'active' || association.confirmedAt === null || association.asset.identityStatus !== 'confirmed' || association.asset.assetType !== 'fund') return null;
    return { currency: association.asset.currency, confirmedAt: association.confirmedAt, assetUpdatedAt: association.asset.updatedAt };
  }

  getFundNavHistory(...args: Parameters<MarketFundReader['getFundNavHistory']>) {
    return this.fundReader.getFundNavHistory(...args);
  }

  getFundHoldings(...args: Parameters<MarketFundReader['getFundHoldings']>) {
    return this.fundReader.getFundHoldings(...args);
  }

  async getChip(input: string, options: { refresh?: boolean } = {}): Promise<ChipDistribution> {
    const { symbol } = normalizeSymbol(input);
    const refresh = options.refresh === true;
    const scope = await this.control.read({ capability: 'CHIP_SUMMARY', symbol });
    const key = `chip:4:${symbol}:${scope.context.generation}`;
    const parse = (value: unknown) => parseCurrentChip(value, symbol);
    const markCached = (value: ChipDistribution) =>
      parseCurrentChip({ ...value, servedFromCache: true }, symbol);
    if (!refresh) {
      const cached = await this.resultCache.readFresh(key, parse, markCached);
      if (cached) { await this.control.assertCurrent(scope); return cached; }
    }
    const result = await this.singleFlight(key, () =>
      this.withDistributedLock(key, () =>
        this.resultCache.transform({
          key,
          refresh,
          parse,
          markCached,
          policy: MARKET_CACHE_POLICIES.chipSummary,
          load: async () => {
            await this.control.assertCurrent(scope);
            const raw = await this.dsa.get<Record<string, unknown>>(
              `/api/v3/thesis-ledger/market/chip?symbol=${encodeURIComponent(symbol)}`,
            );
            const chip = parseCurrentChip(
              {
                ...raw,
                servedFromCache: false,
              },
              symbol,
            );
            await this.control.assertCurrent(scope);
            return chip;
          },
          markStale: (value) =>
            parseCurrentChip(
              {
                ...value,
                fallbackUsed: true,
                servedFromCache: true,
              },
              symbol,
            ),
        }),
      ),
    );
    await this.control.assertCurrent(scope);
    return result;
  }
}
