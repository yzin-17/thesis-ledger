import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { Prisma, type FundDailyEstimateError, type FundValuationPoint } from '@prisma/client';
import {
  fundValuationSchema,
  fundValuationSymbolSchema,
  marketRouteKeyIdV3,
} from '@thesis-ledger/schemas';
import { PrismaService } from '../platform/prisma.service.js';
import { RedisService, redisKey } from '../platform/redis.service.js';
import { DsaClient } from '../integration/dsa/dsa.client.js';
import { MarketCacheControl } from './market-cache-control.js';
import { parseCurrentFundNav } from './market-current-data.js';
import { fundValuationDay } from './fund-valuation-point.repository.js';
import { closingEstimate, fundErrorFor } from './fund-daily-error-method.js';
import { MarketSessionReader } from './market-session-reader.js';
import { MarketPeriodCalendarReader } from './market-period-calendar-reader.js';

@Injectable()
export class FundDailyErrorService {
  private busy = false;
  private timer?: ReturnType<typeof setInterval>;
  private readonly log = new Logger(FundDailyErrorService.name);
  private readonly sessions: MarketSessionReader;
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(RedisService) private readonly redis: RedisService,
    @Inject(DsaClient) private readonly dsa: DsaClient,
    @Optional() sessions?: MarketSessionReader,
  ) {
    this.sessions = sessions ?? new MarketSessionReader(new MarketPeriodCalendarReader(dsa));
  }
  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    const tick = () => void this.run().catch(() => this.log.warn('基金收盘估值检查失败'));
    this.timer = setInterval(tick, 300000);
    this.timer.unref();
    tick();
  }
  onModuleDestroy() {
    clearInterval(this.timer);
  }

  async run(now = new Date()) {
    if (this.busy) return;
    this.busy = true;
    try {
      const today = fundValuationDay(now);
      const current = await this.sessions.read('CN', now);
      const closingAt = current.sessions
        .filter((window) => window.tradingDate === today)
        .at(-1)?.endAt;
      const closed =
        current.state !== 'unknown' && (!closingAt || now.getTime() >= Date.parse(closingAt));
      const limit = new Date(Date.parse(today + 'T00:00:00+08:00') + (closed ? 86400000 : 0));
      const points = await this.db.$queryRaw<FundValuationPoint[]>(Prisma.sql`
        SELECT DISTINCT ON (p."symbol",p."method",(p."minute"+interval '8 hours')::date) p.*
        FROM "FundValuationPoint" p WHERE p."method"='disclosed-holdings-qfq-v1'
        AND p."lastValidAt" IS NOT NULL AND p."minute" >= '2026-11-05 16:00' AND p."minute"<${limit}
        AND NOT EXISTS (SELECT 1 FROM "FundDailyEstimateError" e WHERE e."symbol"=p."symbol" AND e."method"=p."method"
          AND e."day"=to_char(p."minute"+interval '8 hours','YYYY-MM-DD'))
        ORDER BY p."symbol",p."method",(p."minute"+interval '8 hours')::date,p."lastValidAt" DESC LIMIT 100`);
      for (const point of points) {
        const at = point.lastValidAt ?? point.minute;
        const data = closingEstimate(point, now, await this.sessions.read('CN', at));
        if (data)
          await this.db.fundDailyEstimateError.createMany({ data: [data], skipDuplicates: true });
      }
      const pending = await this.db.fundDailyEstimateError.findMany({
        where: { official: { equals: Prisma.DbNull } },
        orderBy: [
          { checkedAt: { sort: 'asc', nulls: 'first' } },
          { day: 'desc' },
          { symbol: 'asc' },
        ],
        take: 12,
      });
      for (const row of pending) {
        try {
          await this.compare(row, now);
        } catch {
          this.log.warn({ symbol: row.symbol, day: row.day, status: 'nav_unavailable' });
        }
      }
    } finally {
      this.busy = false;
    }
  }

  private async compare(row: FundDailyEstimateError, now: Date) {
    const where = {
      symbol: row.symbol,
      day: row.day,
      method: row.method,
      official: { equals: Prisma.DbNull },
    };
    await this.db.fundDailyEstimateError.updateMany({ where, data: { checkedAt: now } });
    const control = new MarketCacheControl(this.dsa);
    const scope = await control.read({ capability: 'FUND_NAV', symbol: row.symbol });
    const admitted = publicComparisonRoute(
      (await this.dsa.effectiveControlPolicyV3()).projection,
      scope,
    );
    if (!admitted) return;
    const { primary, policy } = admitted;
    const estimate = fundValuationSchema.parse(row.estimate).estimatedNav;
    if (estimate === null) return;
    const session = await this.sessions.read('CN', new Date(row.day + 'T12:00:00+08:00'));
    const closingAt = session.sessions
      .filter((window) => window.tradingDate === row.day)
      .at(-1)?.endAt;
    if (session.state === 'unknown' || !closingAt) return;
    const prefix = 'fund-nav:4:' + row.symbol + ':' + scope.context.generation;
    const candidates = await this.redis.client.mget(
      redisKey('cache', prefix + ':fresh'),
      redisKey('cache', prefix + ':last-valid'),
    );
    const settle = async (raw: unknown, fromCache: boolean) => {
      const nav = parseCurrentFundNav(raw, row.symbol);
      const errors = fundErrorFor(
        row.day,
        row.symbol,
        estimate,
        nav,
        fromCache ? now : new Date(),
        closingAt,
      );
      if (!errors) return false;
      await control.assertCurrent(scope);
      await this.db.fundDailyEstimateError.updateMany({
        where,
        data: {
          errors,
          official: {
            ...nav,
            servedFromCache: fromCache,
            upstreamSource: primary.upstreamSource,
            policyRevision: policy.revision,
            generation: scope.context.generation,
          },
        },
      });
      return true;
    };
    for (const cached of candidates) if (cached && (await settle(JSON.parse(cached), true))) return;
    if (row.sourceAttemptAt || now.getTime() < Date.parse(row.day + 'T21:40:00+08:00')) return;
    // 单一最新净值路由不能读取已过去多个交易日的历史窗口。
    if (now.getTime() > Date.parse(row.day + 'T21:40:00+08:00') + 86400000) return;
    const claimed = await this.db.fundDailyEstimateError.updateMany({
      where: { ...where, sourceAttemptAt: null },
      data: { sourceAttemptAt: now },
    });
    if (claimed.count !== 1) return;
    const raw = await this.dsa.get(
      '/api/v3/thesis-ledger/market/fund-nav/public-comparison?symbol=' +
        encodeURIComponent(row.symbol),
      1,
    );
    await settle(raw, false);
  }

  async latest(input: string) {
    const symbol = fundValuationSymbolSchema.parse(input);
    const row = await this.db.fundDailyEstimateError.findFirst({
      where: { symbol },
      orderBy: [{ day: 'desc' }, { method: 'asc' }],
    });
    if (!row) return null;
    const estimate = fundValuationSchema.parse(row.estimate);
    return {
      symbol,
      day: row.day,
      method: row.method,
      estimatedAt: estimate.estimatedAt,
      estimatedNav: estimate.estimatedNav,
      pricedCoverage: estimate.pricedCoverage,
      quality: estimate.quality,
      official: row.official,
      errors: row.errors,
    };
  }
}

function publicComparisonRoute(
  projection: Awaited<ReturnType<DsaClient['effectiveControlPolicyV3']>>['projection'],
  scope: Awaited<ReturnType<MarketCacheControl['read']>>,
) {
  const policy = projection?.effective;
  const key = marketRouteKeyIdV3(scope.context.routeKey);
  const primary = policy?.routes.find((r) => marketRouteKeyIdV3(r.key) === key)?.targets[0];
  if (
    !policy?.enabled ||
    policy.revision !== scope.context.policyRevision ||
    !primary?.eligible ||
    primary.providerId !== 'akshare' ||
    primary.upstreamSource !== 'eastmoney'
  )
    return null;

  return { primary, policy };
}
