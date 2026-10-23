/* 维护入口专用：有限实源读取及自有账户当前分钟，不启动 Nest/Scheduler/模型。 */
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { createRequire } = require('node:module');
const result = { observations: [] };
const serializeDisclosureEvidence = (value) =>
  JSON.stringify(value, (_key, item) => (typeof item === 'bigint' ? item.toString() : item));
module.exports = { serializeDisclosureEvidence };

async function main() {
  const r = createRequire('/app/apps/server/package.json');
  r('reflect-metadata');
  const load = (name) => r('/app/apps/server/dist/src/' + name + '.js');
  const schemas = r('@thesis-ledger/schemas');
  const input = JSON.parse(readFileSync(0, 'utf8'));
  assert(['prepare', 'prices', 'repair-bars', 'inspect', 'sample'].includes(input.phase));
  assert.equal(input.plan.format, 'fund-disclosure-acceptance-v1');
  assert.equal(input.plan.symbol, '161725.OF');
  const { PrismaClient } = r('@prisma/client');
  const prisma = new PrismaClient();
  let redis;
  try {
    const identity = await prisma.$queryRaw`SELECT current_database() AS database`;
    assert.equal(identity[0].database, 'thesis_ledger');
    if (['prepare', 'prices', 'repair-bars'].includes(input.phase)) {
      const { DsaClient } = load('integration/dsa/dsa.client');
      const { RedisService } = load('platform/redis.service');
      const { MarketService } = load('market/market.service');
      const dsa = new DsaClient();
      redis = new RedisService();
      const get = dsa.get.bind(dsa);
      dsa.get = async (path) => {
        assert.notEqual(input.phase, 'repair-bars', '日期修复不得重发基金或报价来源');
        if (input.phase === 'prepare') {
          assert(
            [
              '/api/v3/thesis-ledger/market/fund-nav?symbol=161725.OF',
              '/api/v3/thesis-ledger/market/fund-holdings?symbol=161725.OF',
            ].includes(path),
          );
          assert(
            result.observations.length < 2 && !result.observations.some((o) => o.path === path),
          );
        } else {
          const parsed = new URL(path, 'http://dsa');
          assert.equal(parsed.pathname, '/api/v3/thesis-ledger/market/quote');
          assert(
            input.source.holdings.holdings.some(
              (h) => h.weight > 0 && h.symbol === parsed.searchParams.get('symbol'),
            ),
          );
          assert(
            result.observations.length < 20 && !result.observations.some((o) => o.path === path),
          );
        }
        const observation = { path, startedAt: new Date().toISOString() };
        result.observations.push(observation);
        const raw = await get(path, 1);
        observation.raw = raw;
        return raw;
      };
      const market = new MarketService(dsa, redis, prisma);
      if (input.phase === 'prepare') {
        result.holdings = await market.getFundHoldings('161725.OF', { refresh: true });
        assert.equal(result.holdings.servedFromCache, false);
        assert.equal(result.holdings.fallbackUsed, false);
        assert.equal(result.holdings.provider, 'akshare');
        assert.equal(result.holdings.disclosureEvidence?.status, 'matched');
        const { fundDisclosureAvailableAt } = load('performance/performance-fund-disclosure');
        result.availableAt = fundDisclosureAvailableAt(result.holdings, new Date());
        result.nav = await market.getFundNav('161725.OF', { refresh: true, allowStale: false });
        assert.equal(result.nav.servedFromCache, false);
        assert.equal(result.nav.fallbackUsed, false);
        assert(result.nav.unitNav > 0 && result.nav.freshness === 'delayed');
        result.capturedAt = new Date().toISOString();
      } else {
        const source = input.source;
        schemas.fundHoldingsSchema.parse(source.holdings);
        const positive = source.holdings.holdings.filter((h) => h.weight > 0);
        assert(positive.length > 0 && positive.length <= 20);
        result.prices = {};
        const start = new Date(source.nav.navDate);
        start.setUTCDate(start.getUTCDate() - 7);
        for (const holding of positive) {
          const value = { errors: [] };
          result.prices[holding.symbol] = value;
          if (input.phase === 'repair-bars') {
            const previous = input.prices.prices[holding.symbol];
            assert.equal(previous.httpStatus, 400);
            assert(previous.quote.price > 0 && !previous.bars);
            value.quote = previous.quote;
          } else {
            try {
              value.quote = await market.getQuote(holding.symbol, { allowStale: true });
            } catch {
              value.errors.push('quote_unavailable');
            }
          }
          let end = new Date(source.nav.navDate).toISOString().slice(0, 10);
          if (input.plan.adjustedPriceCase) {
            const { fundQuoteTradingDate } = load('performance/performance-fund-adjusted-return');
            const date =
              value.quote?.marketTime &&
              fundQuoteTradingDate(holding.symbol, value.quote.marketTime);
            if (!date) {
              value.errors.push('quote_calendar_unavailable');
              continue;
            }
            end = date;
          }
          const query = new URLSearchParams({
            assetType: 'STOCK',
            timeframe: '1d',
            adjustment: input.plan.adjustedPriceCase ? 'qfq' : 'none',
            start: start.toISOString().slice(0, 10),
            end,
            acceptance: 'interactive',
          });
          const path = `/api/market/${holding.symbol}/bars?${query}`;
          value.path = path;
          const response = await fetch('http://127.0.0.1:3000' + path, {
            signal: AbortSignal.timeout(30000),
            headers: process.env.SERVER_API_TOKEN
              ? { authorization: `Bearer ${process.env.SERVER_API_TOKEN}` }
              : undefined,
          });
          value.httpStatus = response.status;
          value.raw = await response.json();
          if (response.ok) {
            try {
              value.bars = schemas.barSeriesSchema.parse(value.raw);
            } catch {
              value.errors.push('bars_contract_invalid');
            }
          } else value.errors.push('bars_unavailable');
        }
        result.capturedAt =
          input.phase === 'repair-bars' ? input.prices.capturedAt : new Date().toISOString();
        if (input.phase === 'repair-bars') result.barsRepairedAt = new Date().toISOString();
        if (input.plan.adjustedPriceCase) {
          const { readFundAdjustedHoldingReturn } = load(
            'performance/performance-fund-adjusted-return',
          );
          result.returnChecks = {};
          const retainedMarket = {
            getQuote: async (symbol) => {
              const value = result.prices[symbol]?.quote;
              assert(value);
              return value;
            },
          };
          const retainedBars = {
            readChartV3: async (request) => {
              const value = result.prices[request.identity.symbol]?.bars;
              assert(value);
              return value;
            },
          };
          for (const holding of positive)
            result.returnChecks[holding.symbol] = await readFundAdjustedHoldingReturn({
              symbol: holding.symbol,
              assetType: 'STOCK',
              navDate: source.nav.navDate,
              at: new Date(),
              market: retainedMarket,
              bars: retainedBars,
            });
        }
      }
    } else {
      const account = await prisma.account.findUniqueOrThrow({ where: { id: input.accountId } });
      assert.equal(account.name, input.plan.accountName);
      assert.equal(account.type, 'fund');
      assert.equal(account.mode, 'actual');
      assert.equal(account.currency, 'CNY');
      const events = await prisma.ledgerEvent.findMany({ where: { accountId: account.id } });
      assert(events.length <= 8);
      const ids = new Set();
      for (const event of events) {
        assert(
          event.actorId === input.plan.caseId &&
            event.sourceChannel === 'fund-disclosure-acceptance',
        );
        assert(
          ['deposit', 'buy', 'sell', 'withdraw', 'deposit2', 'buy2', 'sell2', 'withdraw2'].some(
            (key) => event.externalId === `${input.plan.caseId}:${key}`,
          ),
        );
        assert(!ids.has(event.externalId));
        ids.add(event.externalId);
      }
      const positions = await prisma.position.findMany({ where: { accountId: account.id } });
      assert(positions.every((p) => p.symbol === '161725.OF'));
      const { projectCashBalances } = load('ledger/cash-projection');
      const cash = projectCashBalances(events).get(account.id) ?? new Map();
      assert([...cash.keys()].every((key) => key === 'CNY'));
      result.owned = {
        account,
        events: events.map((e) => ({
          actorId: e.actorId,
          sourceChannel: e.sourceChannel,
          externalId: e.externalId,
        })),
        quantity: positions.reduce((sum, p) => sum + Number(p.quantity), 0),
        cashValue: Number(cash.get('CNY') ?? 0),
      };
      if (input.phase === 'inspect')
        result.points = await prisma.accountValuationPoint.findMany({
          where: { accountId: account.id },
          orderBy: { at: 'asc' },
        });
      if (input.phase === 'sample') {
        assert(
          account.active &&
            result.owned.quantity === 100 &&
            result.owned.cashValue === 875 &&
            [2, 6].includes(events.length),
        );
        assert(Date.now() - Date.parse(input.prices.capturedAt) <= 15 * 60_000);
        const nav = schemas.fundNavSchema.parse(input.source.nav);
        const holdings = schemas.fundHoldingsSchema.parse(input.source.holdings);
        const market = {
          getFundNav: async (symbol) => {
            assert.equal(symbol, '161725.OF');
            return nav;
          },
          getFundHoldings: async (symbol) => {
            assert.equal(symbol, '161725.OF');
            return holdings;
          },
          getQuote: async (symbol) => {
            const value = input.prices.prices[symbol]?.quote;
            assert(value);
            return schemas.quoteSchema.parse(value);
          },
        };
        const bars = {
          readChartV3: async (request) => {
            assert.equal(request.identity.timeframe, '1d');
            assert.equal(
              request.identity.adjustment,
              input.plan.adjustedPriceCase ? 'qfq' : 'none',
            );
            const value = input.prices.prices[request.identity.symbol]?.bars;
            assert(value);
            return schemas.barSeriesSchema.parse(value);
          },
        };
        const { PerformanceDataService } = load('performance/performance-data.service');
        const { PerformanceLayerService } = load('performance/performance-layer.service');
        const { PerformanceSnapshotService } = load('performance/performance-snapshot.service');
        const { PerformanceValuationSeriesService } = load(
          'performance/performance-valuation-series.service',
        );
        const data = new PerformanceDataService(prisma, market);
        const layers = new PerformanceLayerService(prisma, market, data);
        const snapshots = new PerformanceSnapshotService(prisma, market, data, bars);
        const service = new PerformanceValuationSeriesService(
          prisma,
          layers,
          snapshots,
          market,
          bars,
        );
        const at = new Date();
        const sampled = await service.sample(at, 'actual', 'CNY', {
          accountId: account.id,
          marketGate: false,
        });
        const points = await prisma.accountValuationPoint.findMany({
          where: { accountId: account.id },
          orderBy: { at: 'asc' },
        });
        result.sampling = {
          observedAt: at.toISOString(),
          marketGateOverridden: true,
          result: sampled,
          points,
          sourcesReusedWithoutRetiming: true,
          projectModelRequests: 0,
        };
      }
    }
    console.log('FUND_DISCLOSURE_RESULT=' + serializeDisclosureEvidence(result));
  } finally {
    if (redis) await redis.onModuleDestroy();
    await prisma.$disconnect();
  }
}
if (!module.parent)
  main().catch((error) => {
    result.error = error.message;
    console.log('FUND_DISCLOSURE_FAILURE=' + serializeDisclosureEvidence(result));
    process.exitCode = 1;
  });
