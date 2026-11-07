import 'reflect-metadata';
import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';
import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { riskObservedSource } from '../../src/risk/risk-observed-source.js';
import { MarketObservationsService } from '../../src/market/market-observations.service.js';
import { RiskRuleService } from '../../src/risk/risk-rule.service.js';
import { RiskService } from '../../src/risk/risk.service.js';
import { RiskValuationContextService } from '../../src/risk/risk-valuation-context.service.js';
import { RiskMonitoringService } from '../../src/risk/risk-monitoring.service.js';
import { MarketBackgroundQuotesService } from '../../src/market/market-background-quotes.service.js';
import { MarketService } from '../../src/market/market.service.js';
import { RiskMarketDemandService } from '../../src/risk/risk-market-demand.service.js';
import { quoteControlFixture } from '../market/quote-control-fixture.js';
import { cancelInactiveRiskDeliveries } from '../../src/notifications/risk-delivery-validity.js';

const databaseUrl = process.env.RISK_MONITORING_DATABASE_URL;
const redisUrl = process.env.RISK_MONITORING_REDIS_URL;
describe.skipIf(!databaseUrl || !redisUrl)('isolated PostgreSQL + Redis risk monitoring', () => {
  let db: PrismaClient;
  let redis: Redis;
  let observations: MarketObservationsService;
  let rules: RiskRuleService;
  let risk: RiskService;
  let valuation: RiskValuationContextService;
  let sequence = 0;
  const queued = new Set<string>();
  const notifications = {
    enqueue: vi.fn(async (subject: { id: string }) => {
      queued.add(subject.id);
      return [];
    }),
    subjectDeliveryStatus: vi.fn(async (subject: { id: string }) => ({
      shouldRetry: !queued.has(subject.id),
    })),
  };
  const createMonitor = () =>
    new RiskMonitoringService(observations, { client: redis } as never, rules, risk, valuation);
  beforeAll(async () => {
    const pg = new URL(databaseUrl!);
    const cache = new URL(redisUrl!);
    if (
      pg.hostname !== '127.0.0.1' ||
      pg.pathname !== '/risk_monitoring_fixture' ||
      pg.username !== 'fixture_owner' ||
      cache.hostname !== '127.0.0.1' ||
      cache.port === '6379' ||
      !process.env.RISK_MONITORING_FIXTURE_ID
    )
      throw new Error('Only explicit isolated runtime is allowed');
    db = new PrismaClient({ datasourceUrl: databaseUrl! });
    redis = new Redis(redisUrl!);
    expect(await db.$queryRaw`SELECT current_database() AS db, current_user AS owner`).toEqual([
      { db: 'risk_monitoring_fixture', owner: 'fixture_owner' },
    ]);
    expect(await redis.get('fixture:owner')).toBe(process.env.RISK_MONITORING_FIXTURE_ID);
    observations = new MarketObservationsService({ client: redis } as never);
    rules = new RiskRuleService(db as never);
    risk = new RiskService(db as never, notifications as never);
    const unexpected = () => {
      throw new Error('Automatic monitoring must not call a remote provider');
    };
    valuation = new RiskValuationContextService(
      db as never,
      { getQuote: unexpected, getFundNav: unexpected, getFxRates: unexpected } as never,
    );
  });
  beforeEach(async () => {
    await db.notificationDelivery.deleteMany();
    await db.riskRuleTriggerState.deleteMany();
    await db.riskEvent.deleteMany();
    await db.riskRuleAudit.deleteMany();
    await db.riskRule.deleteMany();
    await db.riskPositionState.deleteMany();
    await db.position.deleteMany();
    await db.asset.deleteMany();
    await db.account.deleteMany();
    let cursor = '0';
    do {
      const result = await redis.scan(cursor, 'MATCH', 'thesis-ledger:*', 'COUNT', 1000);
      cursor = result[0];
      if (result[1].length) await redis.del(...result[1]);
    } while (cursor !== '0');
    queued.clear();
    vi.clearAllMocks();
    sequence = 0;
  });
  afterAll(async () => {
    await redis?.quit();
    await db?.$disconnect();
  });
  const tick = async (
    price: number,
    monitor: RiskMonitoringService,
    options: { stale?: boolean; old?: boolean } = {},
  ) => {
    const time = new Date(Date.now() - 60_000 + ++sequence * 100).toISOString();
    await observations.record({
      kind: 'quote',
      value: {
        version: 3,
        symbol: '600519.SH',
        open: price,
        high: price,
        low: price,
        price,
        previousClose: 100,
        volume: null,
        amount: null,
        provider: 'isolated',
        fetchedAt: time,
        marketTime: options.old ? '2026-01-01T00:00:00Z' : time,
        freshness: options.stale ? 'stale' : 'live',
        stale: options.stale ?? false,
      },
    });
    await monitor.runNow();
  };
  const createRule = (extra: Record<string, unknown> = {}) =>
    rules.createRule({
      kind: 'price-below',
      scope: 'security',
      symbol: '600519.SH',
      threshold: 100,
      severity: 'critical',
      enabled: true,
      ...extra,
    });

  it('official NAV refresh retains its published date and rejects late provenance', async () => {
    const now = new Date();
    const nav = {
      version: 3 as const,
      symbol: '000001.OF',
      unitNav: 1.2,
      navDate: new Date(now.getTime() - 3 * 86_400_000).toISOString(),
      provider: 'isolated',
      freshness: 'delayed' as const,
      fetchedAt: new Date(now.getTime() - 2 * 86_400_000).toISOString(),
    };
    await observations.record({ kind: 'nav', value: nav });
    await expect(
      riskObservedSource(await observations.snapshots(), now).getFundNav(nav.symbol),
    ).rejects.toThrow();
    const fresh = { ...nav, fetchedAt: now.toISOString() };
    await observations.record({ kind: 'nav', value: fresh });
    await observations.record({ kind: 'nav', value: nav });
    const actual = await riskObservedSource(await observations.snapshots(), now).getFundNav(
      nav.symbol,
    );
    expect(actual.navDate).toBe(nav.navDate);
    expect(actual.fetchedAt).toBe(fresh.fetchedAt);
    expect(actual.freshness).toBe('delayed');
  });

  it('active rules acquire source-limited quotes without a page and feed persistent risk events', async () => {
    const rule = await createRule({ symbol: '510300.SH' });
    const post = vi.fn(async (path: string, request: Record<string, unknown>) => {
      const plan = {
        ...request,
        generation: 'a'.repeat(64),
        policyRevision: 1,
        acquisition: 'public-snapshot',
        reason: null,
        target: { providerId: 'tencent', upstreamSource: 'tencent', routeIndex: 1 },
        minIntervalSeconds: 600,
        sourceUpdateIntervalSeconds: null,
      };
      if (path.endsWith('/plan')) return plan;
      const time = new Date().toISOString();
      return {
        ...plan,
        quote: {
          version: 3,
          symbol: '510300.SH',
          provider: 'tencent',
          price: 90,
          open: 90,
          high: 90,
          low: 90,
          previousClose: 100,
          volume: null,
          amount: null,
          marketTime: time,
          fetchedAt: time,
          freshness: 'live',
          stale: false,
          fallbackUsed: true,
        },
      };
    });
    const unexpected = vi.fn(() => {
      throw new Error('No foreground/upstream GET is allowed');
    });
    const dsa = { post, get: unexpected, marketCacheContextV3: quoteControlFixture };
    const market = new MarketService(
      dsa as never,
      { client: redis } as never,
      db as never,
      observations,
    );
    const background = new MarketBackgroundQuotesService(
      dsa as never,
      { client: redis } as never,
      market,
    );
    const directory = {
      resolveSymbols: vi.fn(async () => ({
        items: [{ symbol: '510300.SH', instrumentType: 'ETF', active: true }],
      })),
    };
    const demand = new RiskMarketDemandService(rules, db as never, directory as never, background);
    // Only the exchange-session clock is controlled; quote source/fetch time remains actual.
    await demand.runNow(new Date('2026-11-06T02:00:00Z'));
    const monitor = createMonitor();
    await monitor.runNow();
    expect(await db.riskEvent.count()).toBe(2); // Actual and shadow each record an event.
    expect(queued.size).toBe(1); // Only the actual event can enqueue a notification.
    const dataCalls = () => post.mock.calls.filter(([path]) => !path.endsWith('/plan')).length;
    expect(dataCalls()).toBe(1);
    expect(unexpected).not.toHaveBeenCalled();
    await demand.runNow(new Date('2026-11-06T02:00:05Z'));
    await createMonitor().runNow();
    expect(dataCalls()).toBe(1);
    expect(await db.riskEvent.count()).toBe(2);
    await rules.updateRule(rule.id, { enabled: false });
    await demand.runNow();
    expect(dataCalls()).toBe(1);
  });

  it('configuration enrolls automatically; updates, recovery, restart and critical dedupe work end to end', async () => {
    await createRule();
    const monitor = createMonitor();
    await tick(90, monitor);
    await tick(89, monitor);
    await createMonitor().runNow();
    expect(await db.riskEvent.count()).toBe(2); // actual + shadow; only actual is notified
    expect(notifications.enqueue).toHaveBeenCalledTimes(1);
    await tick(110, monitor);
    await tick(90, monitor);
    expect(await db.riskEvent.count()).toBe(4);
    expect(notifications.enqueue).toHaveBeenCalledTimes(2);
    expect(await db.riskEvent.findMany({ where: { mode: 'actual' } })).toHaveLength(2);
  });
  it('disabled, archived and future rules do not create events; enabling after data arrival performs initial evaluation', async () => {
    const stored = await createRule({ enabled: false });
    const monitor = createMonitor();
    await tick(90, monitor);
    expect(await db.riskEvent.count()).toBe(0);
    await rules.updateRule(stored.id, { enabled: true });
    await monitor.runNow();
    expect(await db.riskEvent.count()).toBe(2);
    await rules.archiveRule(stored.id);
    await tick(80, monitor);
    await rules.restoreRule(stored.id);
    await tick(70, monitor);
    await createRule({ effectiveAt: new Date(Date.now() + 86_400_000).toISOString() });
    await tick(60, monitor);
    expect(await db.riskEvent.count()).toBe(2);
  });
  it('stale and older observations cannot fake recovery or create another breach', async () => {
    await createRule();
    const monitor = createMonitor();
    await tick(90, monitor);
    await tick(110, monitor, { stale: true });
    await tick(110, monitor, { old: true });
    await tick(89, monitor);
    expect(await db.riskEvent.count()).toBe(2);
    expect(notifications.enqueue).toHaveBeenCalledTimes(1);
  });
  it('concurrent scans serialize on the same persistent target state', async () => {
    await createRule();
    const context = {
      symbol: '600519.SH',
      price: 90,
      marketTime: new Date().toISOString(),
      dataQuality: {},
      mode: 'actual',
    };
    await Promise.all([risk.scan([context]), risk.scan([context]), risk.scan([context])]);
    expect(await db.riskEvent.count()).toBe(1);
    // Queue upserts dedupe subjects; the mock records all contenders separately.
    expect(queued.size).toBe(1);
  });
  it('concurrent scheduled and automatic scans cannot lower the shared holding peak', async () => {
    const account = await db.account.create({
      data: { name: 'isolated', type: 'securities', mode: 'actual' },
    });
    await db.asset.create({
      data: {
        symbol: '600519.SH',
        name: '600519.SH',
        market: 'CN',
        assetType: 'stock',
        currency: 'CNY',
      },
    });
    const position = await db.position.create({
      data: {
        accountId: account.id,
        symbol: '600519.SH',
        quantity: 10,
        costPrice: 100,
        source: 'isolated-fixture',
      },
    });
    await rules.createRule({
      kind: 'trailing-stop',
      scope: 'security',
      symbol: position.symbol,
      accountId: account.id,
      threshold: 0.1,
      severity: 'critical',
      enabled: true,
    });
    const context = (price: number) => ({
      symbol: position.symbol,
      accountId: account.id,
      positionId: position.id,
      quantity: 10,
      price,
      costPrice: 100,
      marketTime: new Date().toISOString(),
      dataQuality: {},
      mode: 'actual',
    });
    await risk.scan([context(120)]);
    await Promise.all([risk.scan([context(130)]), risk.scan([context(125)])]);
    expect((await db.riskPositionState.findFirstOrThrow()).holdingPeak.toString()).toBe('130');
    await risk.scan([context(115)]);
    expect(await db.riskEvent.count()).toBe(1);
  });

  it('a failed database event commit retains the observation for restart recovery', async () => {
    await createRule();
    const monitor = createMonitor();
    await tick(110, monitor);
    await db.$executeRaw`CREATE FUNCTION risk_fixture_reject_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'isolated event commit failure'; END $$`;
    await db.$executeRaw`CREATE TRIGGER risk_fixture_reject_event BEFORE INSERT ON "RiskEvent" FOR EACH ROW EXECUTE FUNCTION risk_fixture_reject_event()`;
    try {
      await tick(90, monitor);
      expect(await db.riskEvent.count()).toBe(0);
    } finally {
      await db.$executeRaw`DROP TRIGGER risk_fixture_reject_event ON "RiskEvent"`;
      await db.$executeRaw`DROP FUNCTION risk_fixture_reject_event()`;
    }
    await createMonitor().runNow();
    expect(await db.riskEvent.count()).toBe(2);
    expect(notifications.enqueue).toHaveBeenCalledTimes(1);
  });

  it('notification enqueue failure reuses the event after restart and rule disable cancels pending delivery', async () => {
    const stored = await createRule();
    const monitor = createMonitor();
    notifications.enqueue.mockRejectedValueOnce(new Error('isolated enqueue failure'));
    await tick(90, monitor);
    await createMonitor().runNow();
    const actual = await db.riskEvent.findMany({ where: { mode: 'actual' } });
    expect(actual).toHaveLength(1);
    expect(queued.has(actual[0]!.id)).toBe(true);
    const delivery = await db.notificationDelivery.create({
      data: {
        subjectType: 'risk-event',
        subjectId: actual[0]!.id,
        message: {},
        channel: 'feishu',
        provider: 'isolated-never-send',
        severity: 'critical',
        status: 'pending',
        dedupKey: 'isolated',
        scheduledAt: new Date(),
      },
    });
    await rules.updateRule(stored.id, { enabled: false });
    expect(await cancelInactiveRiskDeliveries(db as never, delivery.id)).toBe(1);
    expect(await db.notificationDelivery.findUnique({ where: { id: delivery.id } })).toMatchObject({
      status: 'cancelled',
      errorCode: 'risk_rule_inactive',
    });
  });
});
