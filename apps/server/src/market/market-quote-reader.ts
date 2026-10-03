import { parseCurrentQuote } from './market-current-data.js';
import { normalizeSymbol } from '@thesis-ledger/domain';
import { type Quote } from '@thesis-ledger/schemas';
import { type DsaClient, DsaError } from '../integration/dsa/dsa.client.js';
import { type RedisService, redisKey } from '../platform/redis.service.js';
import { StructuredLogger, currentTraceId } from '../platform/structured-logger.js';
import { MARKET_CACHE_POLICIES } from './market-result-cache.js';

const DEFAULT_DSA_TIMEOUT_MS = 5_000;
const QUOTE_LOCK_SAFETY_MARGIN_MS = 5_000;
const QUOTE_LOCK_POLL_INTERVAL_MS = 100;

type QuoteReadOptions = { allowStale?: boolean; refresh?: boolean };

type QuoteRedisClient = {
  get?: (key: string) => Promise<string | null>;
  set?: (...args: [string, string, 'PX', number, 'NX']) => Promise<string | null>;
  eval?: (script: string, keyCount: number, ...args: string[]) => Promise<unknown>;
  multi?: () => QuoteRedisMulti;
};

type QuoteRedisMulti = {
  set: (key: string, value: string, mode: 'EX', ttl: number) => QuoteRedisMulti;
  exec: () => Promise<unknown>;
};

/**
 * Quote-specific cache and concurrency module. Its small interface keeps the
 * freshness, lease, and single-upstream-call invariants at one seam.
 */
export class MarketQuoteReader {
  private readonly logger = new StructuredLogger('thesis-ledger.market');
  private readonly flights = new Map<string, Promise<Quote>>();

  constructor(
    private readonly dsa: DsaClient,
    private readonly redis: RedisService,
  ) {}

  private singleFlight(key: string, work: () => Promise<Quote>) {
    const existing = this.flights.get(key);
    if (existing) return existing;
    const pending = work().finally(() => {
      if (this.flights.get(key) === pending) this.flights.delete(key);
    });
    this.flights.set(key, pending);
    return pending;
  }

  private lockTtlMs() {
    const configured = Number((this.dsa as DsaClient & { timeoutMs?: number }).timeoutMs);
    const timeoutMs =
      Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_DSA_TIMEOUT_MS;
    return timeoutMs + QUOTE_LOCK_SAFETY_MARGIN_MS;
  }

  private client(): QuoteRedisClient | undefined {
    return this.redis?.client;
  }

  private async readFreshOrLastValid(
    freshKey: string,
    lastValidKey: string,
    symbol: string,
    startedAt: number,
    status: string,
  ): Promise<Quote> {
    const client = this.client();
    let fresh: string | null = null;
    try {
      fresh = typeof client?.get === 'function' ? await client.get(freshKey) : null;
    } catch {
      // A fresh cache read failure must not prevent trying last-valid.
    }
    if (fresh) {
      try {
        const parsed = parseCurrentQuote({ ...JSON.parse(fresh), servedFromCache: true }, symbol);
        this.logStage(symbol, 'fresh-hit', startedAt, 'cache');
        return parsed;
      } catch {
        // A corrupt fresh entry is not evidence to call upstream; try last-valid.
      }
    }
    let lastValid: string | null = null;
    try {
      lastValid = typeof client?.get === 'function' ? await client.get(lastValidKey) : null;
    } catch {
      // Last-valid failure is handled as unavailable below.
    }
    if (lastValid) {
      try {
        const parsed = parseCurrentQuote(
          {
            ...JSON.parse(lastValid),
            stale: true,
            freshness: 'stale',
            servedFromCache: true,
          },
          symbol,
        );
        this.logStage(symbol, 'last-valid', startedAt, 'stale');
        return parsed;
      } catch {
        // Invalid last-valid data cannot be served as a quote.
      }
    }
    this.logStage(symbol, 'unavailable', startedAt, status);
    throw new DsaError('行情暂时不可用', 'unavailable');
  }

  private logStage(symbol: string, stage: string, startedAt: number, status?: string) {
    this.logger.log({
      operation: 'market.quote',
      stage,
      symbol,
      durationMs: Date.now() - startedAt,
      traceId: currentTraceId() ?? 'unknown',
      ...(status === undefined ? {} : { status }),
    });
  }

  private async withQuoteLock(
    key: string,
    work: () => Promise<Quote>,
    onWait: () => Promise<Quote>,
    onUnavailable: () => Promise<Quote>,
    onAcquired: () => void,
  ) {
    const client = this.client();
    if (typeof client?.set !== 'function') return onUnavailable();

    const lockKey = redisKey('lock', `market:${key}`);
    const lockValue = crypto.randomUUID();
    const ttlMs = this.lockTtlMs();
    let acquired: string | null;
    try {
      acquired = await client.set(lockKey, lockValue, 'PX', ttlMs, 'NX');
    } catch {
      return onUnavailable();
    }
    if (acquired !== 'OK') {
      const waitAttempts = Math.max(1, Math.ceil(ttlMs / QUOTE_LOCK_POLL_INTERVAL_MS));
      if (typeof client.get === 'function') {
        for (let attempt = 0; attempt < waitAttempts; attempt += 1) {
          await new Promise((resolve) => setTimeout(resolve, QUOTE_LOCK_POLL_INTERVAL_MS));
          try {
            if ((await client.get(lockKey)) === null) return onWait();
          } catch {
            return onUnavailable();
          }
        }
      }
      return onWait();
    }
    onAcquired();
    try {
      return await work();
    } finally {
      try {
        if (typeof client.eval === 'function')
          await client.eval(
            'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) end return 0',
            1,
            lockKey,
            lockValue,
          );
      } catch {
        // TTL 负责最终释放锁；释放失败不能覆盖已获得的行情结果。
      }
    }
  }

  async getQuote(input: string, options: QuoteReadOptions = {}): Promise<Quote> {
    const { symbol } = normalizeSymbol(input);
    const flightKey = `quote:3:${symbol}`;
    const freshKey = redisKey('cache', `quote:3:${symbol}:fresh`);
    const lastValidKey = redisKey('cache', `quote:3:${symbol}:last-valid`);
    const startedAt = Date.now();
    const readFallback = (status: string) =>
      this.readFreshOrLastValid(freshKey, lastValidKey, symbol, startedAt, status);

    if (!options.refresh) {
      try {
        const cached = await this.client()?.get?.(freshKey);
        if (cached) {
          const parsed = parseCurrentQuote(
            { ...JSON.parse(cached), servedFromCache: true },
            symbol,
          );
          this.logStage(symbol, 'fresh-hit', startedAt, 'cache');
          return parsed;
        }
      } catch {
        return readFallback('cache-error');
      }
    }

    return this.singleFlight(flightKey, () =>
      this.withQuoteLock(
        flightKey,
        async () => {
          if (!options.refresh) {
            try {
              const cached = await this.client()?.get?.(freshKey);
              if (cached) {
                const parsed = parseCurrentQuote(
                  {
                    ...JSON.parse(cached),
                    servedFromCache: true,
                  },
                  symbol,
                );
                this.logStage(symbol, 'fresh-hit', startedAt, 'cache');
                return parsed;
              }
            } catch {
              return readFallback('cache-error');
            }
          }

          const dsaStartedAt = Date.now();
          this.logStage(symbol, 'dsa-call', dsaStartedAt, 'started');
          let raw: Record<string, unknown>;
          try {
            raw = await this.dsa.get<Record<string, unknown>>(
              `/api/v3/thesis-ledger/market/quote?symbol=${encodeURIComponent(symbol)}`,
              1,
            );
            this.logStage(symbol, 'dsa-call', dsaStartedAt, 'success');
          } catch (error) {
            this.logStage(symbol, 'dsa-call', dsaStartedAt, 'failure');
            try {
              return await readFallback(error instanceof DsaError ? error.code : 'dsa-error');
            } catch {
              if (error instanceof DsaError) throw error;
              throw new DsaError('行情暂时不可用', 'unavailable');
            }
          }

          try {
            const quote = parseCurrentQuote(
              {
                ...raw,
                servedFromCache: false,
              },
              symbol,
            );
            const serialized = JSON.stringify(quote);
            const multi = this.client()?.multi;
            if (typeof multi !== 'function') return readFallback('cache-unavailable');
            await multi
              .call(this.client())
              .set(freshKey, serialized, 'EX', MARKET_CACHE_POLICIES.realtimeQuote.freshSeconds)
              .set(
                lastValidKey,
                serialized,
                'EX',
                MARKET_CACHE_POLICIES.realtimeQuote.lastValidSeconds,
              )
              .exec();
            return quote;
          } catch (error) {
            try {
              return await readFallback('unavailable');
            } catch {
              if (error instanceof DsaError) throw error;
              throw new DsaError('行情暂时不可用', 'unavailable');
            }
          }
        },
        () => {
          this.logStage(symbol, 'lock-wait', startedAt, 'loser');
          return readFallback('lock-wait');
        },
        () => readFallback('unavailable'),
        () => this.logStage(symbol, 'lock-acquired', startedAt, 'owner'),
      ),
    ).then((quote) => {
      if (options.allowStale === false && quote.stale)
        throw new Error('行情陈旧，当前操作要求新鲜行情');
      return quote;
    });
  }
}
