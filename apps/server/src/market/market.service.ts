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
} from '@thesis-ledger/schemas';
import { DsaClient } from '../integration/dsa/dsa.client.js';
import { RedisService, redisKey } from '../platform/redis.service.js';
import { PrismaService } from '../platform/prisma.service.js';
import { MarketFundReader } from './market-fund-reader.js';
import { MarketCacheControl } from './market-cache-control.js';
import { MarketQuoteReader, type QuoteReadOptions } from './market-quote-reader.js';
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

  constructor(
    private readonly dsa: DsaClient,
    private readonly redis: RedisService,
    @Optional() private readonly prisma?: PrismaService,
  ) {
    this.quoteReader = new MarketQuoteReader(dsa, redis);
    this.control = new MarketCacheControl(dsa);
    this.fundReader = new MarketFundReader(dsa, redis, this.singleFlight.bind(this),
      this.withDistributedLock.bind(this), prisma);
    this.resultCache = new MarketResultCache(redis);
  }

  private readonly flights = new Map<string, Promise<unknown>>();

  private singleFlight<T>(key: string, work: () => Promise<T>): Promise<T> {
    const existing = this.flights.get(key) as Promise<T> | undefined;
    if (existing) return existing;
    const pending = work().finally(() => {
      if (this.flights.get(key) === pending) this.flights.delete(key);
    });
    this.flights.set(key, pending);
    return pending;
  }

  private async withDistributedLock<T>(key: string, work: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    signal?.throwIfAborted();
    if (!this.redis?.client) return work();
    const client = this.redis.client as unknown as {
      set?: (...args: [string, string, 'PX', number, 'NX']) => Promise<string | null>;
      get?: (key: string) => Promise<string | null>;
      eval?: (script: string, keyCount: number, ...args: string[]) => Promise<unknown>;
    };
    if (typeof client.set !== 'function') return work();

    const lockKey = redisKey('lock', `market:${key}`);
    const lockValue = crypto.randomUUID();
    // 历史净值锁内最多三次控制复核和一次数据请求，沿用每次原 DSA deadline。
    const configured = Number(this.dsa.timeoutMs);
    const timeoutMs = Number.isFinite(configured) && configured > 0 ? configured : 5_000;
    const leaseMs = timeoutMs * 4 + 5_000;
    let acquired: string | null = null;
    try {
      acquired = await client.set(lockKey, lockValue, 'PX', leaseMs, 'NX');
    } catch {
      return work();
    }
    if (acquired !== 'OK') {
      if (typeof client.get === 'function') {
        for (let attempt = 0; attempt < Math.ceil(leaseMs / 200); attempt += 1) {
          signal?.throwIfAborted();
          await new Promise((resolve) => setTimeout(resolve, 200));
          if ((await client.get(lockKey)) === null) break;
        }
      }
      return work();
    }

    try {
      return await work();
    } finally {
      try {
        if (typeof client.eval === 'function') {
          await client.eval(
            'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) end return 0',
            1,
            lockKey,
            lockValue,
          );
        }
      } catch {
        // TTL 负责最终释放锁；释放失败不能覆盖已获得的行情结果。
      }
    }
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
      return fxRatesResponseSchema.parse(raw);
    });
  }

  getQuote(input: string, options: QuoteReadOptions = {}) {
    return this.quoteReader.getQuote(input, options);
  }

  getFundNav(...args: Parameters<MarketFundReader['getFundNav']>) {
    return this.fundReader.getFundNav(...args);
  }

  /** 当前净值的原协议没有币种；只接受已确认、未变化的 CNY 基金元数据。 */
  async getFundNavWithCurrency(instrument: { instrumentId: string; symbol: string }, signal?: AbortSignal) {
    signal?.throwIfAborted();
    const proof = await this.fundCurrencyProof(instrument);
    if (!proof) return { status: 'unavailable' as const, reason: 'fund_currency_unverified' as const };
    if (proof.currency !== 'CNY') return { status: 'unavailable' as const, reason: 'fund_currency_unsupported' as const };
    signal?.throwIfAborted();
    const nav = await this.fundReader.getFundNav(instrument.symbol, { allowStale: false, ...(signal ? { signal } : {}) });
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
