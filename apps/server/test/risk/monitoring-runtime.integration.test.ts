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
import { compileStrategyMonitoringPlan } from '@thesis-ledger/domain';
import { StrategyRiskApplicationStoreService } from '../../src/strategy-optimization/strategy-risk-application-store.service.js';
import { StrategyRiskContextService } from '../../src/risk/strategy-risk-context.service.js';
import { StrategyRiskRuntimeService } from '../../src/risk/strategy-risk-runtime.service.js';
import { StrategyRiskMonitoringService } from '../../src/risk/strategy-risk-monitoring.service.js';
import { MarketBackgroundBarReader } from '../../src/market/market-background-bar-reader.js';
import { controlledMarketSession } from '../market/market-session.fixture.js';
import { redisKey } from '../../src/platform/redis.service.js';

const databaseUrl = process.env.RISK_MONITORING_DATABASE_URL;
const redisUrl = process.env.RISK_MONITORING_REDIS_URL;
describe.skipIf(!databaseUrl || !redisUrl)('isolated PostgreSQL + Redis risk monitoring', () => {
  const suiteScope = riskMonitoringContext();
  registerRiskMonitoringSourceCases(suiteScope);
  registerRiskMonitoringRecoveryAndConcurrencyCases(suiteScope);
  registerRiskMonitoringFailureAndApplicationCases(suiteScope);
});

function riskMonitoringContext() {
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
    await db.$executeRaw`DELETE FROM "StrategyRiskApplication"`;
    await db.strategyVersion.deleteMany();
    await db.strategy.deleteMany();
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
        version: 1,
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
  return {
    get db() {
      return db;
    },
    set db(value: typeof db) {
      db = value;
    },
    get redis() {
      return redis;
    },
    set redis(value: typeof redis) {
      redis = value;
    },
    get observations() {
      return observations;
    },
    set observations(value: typeof observations) {
      observations = value;
    },
    get rules() {
      return rules;
    },
    set rules(value: typeof rules) {
      rules = value;
    },
    get risk() {
      return risk;
    },
    set risk(value: typeof risk) {
      risk = value;
    },
    get valuation() {
      return valuation;
    },
    set valuation(value: typeof valuation) {
      valuation = value;
    },
    get sequence() {
      return sequence;
    },
    set sequence(value: typeof sequence) {
      sequence = value;
    },
    get queued() {
      return queued;
    },
    get notifications() {
      return notifications;
    },
    get createMonitor() {
      return createMonitor;
    },
    get tick() {
      return tick;
    },
    get createRule() {
      return createRule;
    },
  };
}
function registerRiskMonitoringSourceCases(suiteScope: ReturnType<typeof riskMonitoringContext>) {
  it('official NAV refresh retains its published date and rejects late provenance', async () => {
    const now = new Date();
    const nav = {
      version: 1 as const,
      symbol: '000001.OF',
      unitNav: 1.2,
      navDate: new Date(now.getTime() - 3 * 86_400_000).toISOString(),
      provider: 'isolated',
      freshness: 'delayed' as const,
      fetchedAt: new Date(now.getTime() - 2 * 86_400_000).toISOString(),
    };
    await suiteScope.observations.record({ kind: 'nav', value: nav });
    await expect(
      riskObservedSource(await suiteScope.observations.snapshots(), now).getFundNav(nav.symbol),
    ).rejects.toThrow();
    const fresh = { ...nav, fetchedAt: now.toISOString() };
    await suiteScope.observations.record({ kind: 'nav', value: fresh });
    await suiteScope.observations.record({ kind: 'nav', value: nav });
    const actual = await riskObservedSource(
      await suiteScope.observations.snapshots(),
      now,
    ).getFundNav(nav.symbol);
    expect(actual.navDate).toBe(nav.navDate);
    expect(actual.fetchedAt).toBe(fresh.fetchedAt);
    expect(actual.freshness).toBe('delayed');
  });
  it('active rules acquire source-limited quotes without a page and feed persistent risk events', async () => {
    const rule = await suiteScope.createRule({ symbol: '510300.SH' });
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
          version: 1,
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
      { client: suiteScope.redis } as never,
      suiteScope.db as never,
      suiteScope.observations,
    );
    vi.spyOn(market, 'getSession').mockImplementation((market, time = new Date()) =>
      controlledMarketSession(market, time),
    );
    const background = new MarketBackgroundQuotesService(
      dsa as never,
      { client: suiteScope.redis } as never,
      market,
    );
    const directory = {
      resolveSymbols: vi.fn(async () => ({
        items: [{ symbol: '510300.SH', instrumentType: 'ETF', active: true }],
      })),
    };
    const demand = new RiskMarketDemandService(
      suiteScope.rules,
      suiteScope.db as never,
      directory as never,
      background,
    );
    // Only the exchange-session clock is controlled; quote source/fetch time remains actual.
    await demand.runNow(new Date('2026-11-06T02:00:00Z'));
    const monitor = suiteScope.createMonitor();
    await monitor.runNow();
    expect(await suiteScope.db.riskEvent.count()).toBe(2); // Actual and shadow each record an event.
    expect(suiteScope.queued.size).toBe(1); // Only the actual event can enqueue a notification.
    const dataCalls = () => post.mock.calls.filter(([path]) => !path.endsWith('/plan')).length;
    expect(dataCalls()).toBe(1);
    expect(unexpected).not.toHaveBeenCalled();
    await demand.runNow(new Date('2026-11-06T02:00:05Z'));
    await suiteScope.createMonitor().runNow();
    expect(dataCalls()).toBe(1);
    expect(await suiteScope.db.riskEvent.count()).toBe(2);
    await suiteScope.rules.updateRule(rule.id, { enabled: false });
    await demand.runNow();
    expect(dataCalls()).toBe(1);
  });
}
function registerRiskMonitoringRecoveryAndConcurrencyCases(
  suiteScope: ReturnType<typeof riskMonitoringContext>,
) {
  it('configuration enrolls automatically; updates, recovery, restart and critical dedupe work end to end', async () => {
    await suiteScope.createRule();
    const monitor = suiteScope.createMonitor();
    await suiteScope.tick(90, monitor);
    await suiteScope.tick(89, monitor);
    await suiteScope.createMonitor().runNow();
    expect(await suiteScope.db.riskEvent.count()).toBe(2); // actual + shadow; only actual is notified
    expect(suiteScope.notifications.enqueue).toHaveBeenCalledTimes(1);
    await suiteScope.tick(110, monitor);
    await suiteScope.tick(90, monitor);
    expect(await suiteScope.db.riskEvent.count()).toBe(4);
    expect(suiteScope.notifications.enqueue).toHaveBeenCalledTimes(2);
    expect(await suiteScope.db.riskEvent.findMany({ where: { mode: 'actual' } })).toHaveLength(2);
  });
  it('disabled, archived and future rules do not create events; enabling after data arrival performs initial evaluation', async () => {
    const stored = await suiteScope.createRule({ enabled: false });
    const monitor = suiteScope.createMonitor();
    await suiteScope.tick(90, monitor);
    expect(await suiteScope.db.riskEvent.count()).toBe(0);
    await suiteScope.rules.updateRule(stored.id, { enabled: true });
    await monitor.runNow();
    expect(await suiteScope.db.riskEvent.count()).toBe(2);
    await suiteScope.rules.archiveRule(stored.id);
    await suiteScope.tick(80, monitor);
    await suiteScope.rules.restoreRule(stored.id);
    await suiteScope.tick(70, monitor);
    await suiteScope.createRule({ effectiveAt: new Date(Date.now() + 86_400_000).toISOString() });
    await suiteScope.tick(60, monitor);
    expect(await suiteScope.db.riskEvent.count()).toBe(2);
  });
  it('stale and older observations cannot fake recovery or create another breach', async () => {
    await suiteScope.createRule();
    const monitor = suiteScope.createMonitor();
    await suiteScope.tick(90, monitor);
    await suiteScope.tick(110, monitor, { stale: true });
    await suiteScope.tick(110, monitor, { old: true });
    await suiteScope.tick(89, monitor);
    expect(await suiteScope.db.riskEvent.count()).toBe(2);
    expect(suiteScope.notifications.enqueue).toHaveBeenCalledTimes(1);
  });
  it('concurrent scans serialize on the same persistent target state', async () => {
    await suiteScope.createRule();
    const context = {
      symbol: '600519.SH',
      price: 90,
      marketTime: new Date().toISOString(),
      dataQuality: {},
      mode: 'actual',
    };
    await Promise.all([
      suiteScope.risk.scan([context]),
      suiteScope.risk.scan([context]),
      suiteScope.risk.scan([context]),
    ]);
    expect(await suiteScope.db.riskEvent.count()).toBe(1);
    // Queue upserts dedupe subjects; the mock records all contenders separately.
    expect(suiteScope.queued.size).toBe(1);
  });
  it('concurrent scheduled and automatic scans cannot lower the shared holding peak', async () => {
    const account = await suiteScope.db.account.create({
      data: { name: 'isolated', type: 'securities', mode: 'actual' },
    });
    await suiteScope.db.asset.create({
      data: {
        symbol: '600519.SH',
        name: '600519.SH',
        market: 'CN',
        assetType: 'stock',
        currency: 'CNY',
      },
    });
    const position = await suiteScope.db.position.create({
      data: {
        accountId: account.id,
        symbol: '600519.SH',
        quantity: 10,
        costPrice: 100,
        source: 'isolated-fixture',
      },
    });
    await suiteScope.rules.createRule({
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
    await suiteScope.risk.scan([context(120)]);
    await Promise.all([suiteScope.risk.scan([context(130)]), suiteScope.risk.scan([context(125)])]);
    expect((await suiteScope.db.riskPositionState.findFirstOrThrow()).holdingPeak.toString()).toBe(
      '130',
    );
    await suiteScope.risk.scan([context(115)]);
    expect(await suiteScope.db.riskEvent.count()).toBe(1);
  });
}
function registerRiskMonitoringFailureAndApplicationCases(
  suiteScope: ReturnType<typeof riskMonitoringContext>,
) {
  it('a failed database event commit retains the observation for restart recovery', async () => {
    await suiteScope.createRule();
    const monitor = suiteScope.createMonitor();
    await suiteScope.tick(110, monitor);
    await suiteScope.db
      .$executeRaw`CREATE FUNCTION risk_fixture_reject_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'isolated event commit failure'; END $$`;
    await suiteScope.db
      .$executeRaw`CREATE TRIGGER risk_fixture_reject_event BEFORE INSERT ON "RiskEvent" FOR EACH ROW EXECUTE FUNCTION risk_fixture_reject_event()`;
    try {
      await suiteScope.tick(90, monitor);
      expect(await suiteScope.db.riskEvent.count()).toBe(0);
    } finally {
      await suiteScope.db.$executeRaw`DROP TRIGGER risk_fixture_reject_event ON "RiskEvent"`;
      await suiteScope.db.$executeRaw`DROP FUNCTION risk_fixture_reject_event()`;
    }
    await suiteScope.createMonitor().runNow();
    expect(await suiteScope.db.riskEvent.count()).toBe(2);
    expect(suiteScope.notifications.enqueue).toHaveBeenCalledTimes(1);
  });
  it('notification enqueue failure reuses the event after restart and rule disable cancels pending delivery', async () => {
    const stored = await suiteScope.createRule();
    const monitor = suiteScope.createMonitor();
    suiteScope.notifications.enqueue.mockRejectedValueOnce(new Error('isolated enqueue failure'));
    await suiteScope.tick(90, monitor);
    await suiteScope.createMonitor().runNow();
    const actual = await suiteScope.db.riskEvent.findMany({ where: { mode: 'actual' } });
    expect(actual).toHaveLength(1);
    expect(suiteScope.queued.has(actual[0]!.id)).toBe(true);
    const delivery = await suiteScope.db.notificationDelivery.create({
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
    await suiteScope.rules.updateRule(stored.id, { enabled: false });
    expect(await cancelInactiveRiskDeliveries(suiteScope.db as never, delivery.id)).toBe(1);
    expect(
      await suiteScope.db.notificationDelivery.findUnique({ where: { id: delivery.id } }),
    ).toMatchObject({
      status: 'cancelled',
      errorCode: 'risk_rule_inactive',
    });
  });
  it('策略应用无报价更新也自动执行，真实事件去重并恢复通知，缺开仓时间单独说明', async () => {
    const symbol = '600519.SH';
    const account = await suiteScope.db.account.create({
      data: { name: '策略自动监控隔离账户', type: 'securities', mode: 'actual', currency: 'CNY' },
    });
    await suiteScope.db.asset.create({
      data: { symbol, name: '隔离标的', market: 'CN', assetType: 'stock', currency: 'CNY' },
    });
    await suiteScope.db.position.create({
      data: { accountId: account.id, symbol, quantity: '100', costPrice: '100', source: 'fixture' },
    });
    const strategy = await suiteScope.db.strategy.create({
      data: { name: '策略自动监控隔离策略', status: 'active', schemaVersion: 2 },
    });
    const version = await suiteScope.db.strategyVersion.create({
      data: { strategyId: strategy.id, version: 1, schemaVersion: 2, schema: {} },
    });
    const plan = compileStrategyMonitoringPlan(
      {
        executionInstrument: { symbol },
        primaryTimeframe: '1d',
        risk: [
          { type: 'fixedStop', percent: '0.03' },
          { type: 'maxHoldingPeriod', periods: 10 },
        ],
      },
      'controlled',
      version.id,
    );
    const applicationId = crypto.randomUUID();
    const notification = {
      enabled: true,
      severity: 'warning' as const,
      cooldownMinutes: 30,
      channels: ['feishu' as const],
      providers: ['隔离通知'],
    };
    const store = new StrategyRiskApplicationStoreService(suiteScope.db as never);
    await suiteScope.db.$transaction(async (transaction) => {
      await store.insertApplication(transaction, {
        id: applicationId,
        strategyVersionId: version.id,
        accountId: account.id,
        symbol,
        plan,
        cycleMode: 'existingAndFuture',
        cycleAnchor: {},
        enabled: true,
        notification,
        idempotencyKey: crypto.randomUUID(),
      });
      await store.createFrozenRules(transaction, {
        applicationId,
        accountId: account.id,
        symbol,
        revision: 1,
        enabled: true,
        notification,
        plan,
      });
    });
    const tradingDate = (await controlledMarketSession('CN', new Date()))
      .latestCompletedTradingDate!;
    const reader = {
      readV3: vi.fn(async () => ({
        status: 'selected',
        selection: {
          response: {
            bars: [
              {
                timestamp: `${tradingDate}T00:00:00Z`,
                availableAt: `${tradingDate}T07:00:00Z`,
                open: 90,
                high: 90,
                low: 90,
                close: 90,
                volume: 100,
                amount: 9000,
                completionStatus: 'complete',
              },
            ],
            provenance: { providerId: 'isolated' },
          },
        },
      })),
    };
    await suiteScope.db.desiredProviderPolicy.upsert({
      where: { consumer: 'thesis-ledger' },
      create: {
        consumer: 'thesis-ledger',
        enabled: true,
        revision: 1,
        syncState: 'applied',
        routes: [],
      },
      update: { enabled: true, revision: 1, syncState: 'applied', routes: [] },
    });
    const background = new MarketBackgroundBarReader(
      reader as never,
      { client: suiteScope.redis } as never,
      suiteScope.db as never,
    );
    const contexts = new StrategyRiskContextService(
      suiteScope.db as never,
      reader as never,
      { getSession: controlledMarketSession } as never,
      background,
    );
    const runtime = new StrategyRiskRuntimeService(suiteScope.db as never, contexts);
    const strategyRisk = new RiskService(
      suiteScope.db as never,
      suiteScope.notifications as never,
      suiteScope.rules,
      undefined,
      undefined,
      runtime,
    );
    const strategyMonitor = new StrategyRiskMonitoringService(strategyRisk, {
      client: suiteScope.redis,
    } as never);
    const monitor = new RiskMonitoringService(
      suiteScope.observations,
      { client: suiteScope.redis } as never,
      suiteScope.rules,
      strategyRisk,
      suiteScope.valuation,
      strategyMonitor,
    );
    suiteScope.notifications.enqueue.mockRejectedValueOnce(new Error('隔离通知排队失败'));
    await monitor.runNow();
    const events = await suiteScope.db.riskEvent.findMany();
    expect(events).toHaveLength(1);
    expect(events[0]?.mode).toBe('actual');
    const health = await suiteScope.redis.hgetall(redisKey('cache', 'risk-monitoring-health'));
    expect(JSON.parse(health.strategyRuleIssues!)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ reasonCode: 'notification_enqueue_failed' }),
        expect.objectContaining({ reasonCode: 'holding_start_missing' }),
      ]),
    );
    await strategyRisk.evaluateStrategyApplication(applicationId, new Date(), { background: true });
    await strategyRisk.evaluateStrategyApplication(applicationId, new Date(), { background: true });
    expect(await suiteScope.db.riskEvent.count()).toBe(1);
    expect(await suiteScope.db.riskEvent.count({ where: { mode: 'shadow' } })).toBe(0);
    expect(suiteScope.notifications.enqueue).toHaveBeenCalledTimes(2);
    expect(suiteScope.queued.has(events[0]!.id)).toBe(true);
    expect(reader.readV3).toHaveBeenCalledOnce();
    await monitor.runNow();
    expect(reader.readV3).toHaveBeenCalledOnce();
    expect(await suiteScope.redis.xlen(redisKey('queue', 'market-observations'))).toBe(0);
  });
}
