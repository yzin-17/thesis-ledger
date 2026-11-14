import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const root = pathToFileURL(__CODE_ROOT__ + '/');
const fixture = __FIXTURE__;
const appRequire = createRequire(new URL('apps/server/dist/src/platform/redis.service.js', root));
const { Redis } = appRequire('ioredis');
const { DsaClient } = await import(new URL('apps/server/dist/src/integration/dsa/dsa.client.js', root));
const { MarketSessionReader } = await import(new URL('apps/server/dist/src/market/market-session-reader.js', root));
const { MarketPeriodCalendarReader } = await import(new URL('apps/server/dist/src/market/market-period-calendar-reader.js', root));
const { MarketCacheControl } = await import(new URL('apps/server/dist/src/market/market-cache-control.js', root));
const { MarketChartResultCache } = await import(new URL('apps/server/dist/src/market/market-chart-result-cache.js', root));
const { marketChartBarsResponseV3Schema } = await import(new URL('node_modules/@thesis-ledger/schemas/dist/index.js', root)).catch(() =>
  import(new URL('packages/schemas/dist/index.js', root)));

const redis = new Redis(process.env.CACHE_QA_REDIS_URL, { maxRetriesPerRequest: 0, retryStrategy: () => null });
const dsa = new DsaClient();
let providerPriceCalls = 0;
dsa.marketChartBarsV3 = async () => { providerPriceCalls++; throw new Error('受控验收禁止价格接口'); };
const sessions = new MarketSessionReader(new MarketPeriodCalendarReader(dsa));
const controls = new MarketCacheControl(dsa);
const cache = new MarketChartResultCache(dsa, { client: redis }, sessions);
const report = { realControl: true, realCalendar: true, realRedis: true, controlledPriceLoader: true, scopes: [] };
try {
  await redis.ping();
  if (process.env.CACHE_QA_TARGET_MODE === '1') {
    const response = await fetch('http://127.0.0.1:3000/api/v1/health', { signal: AbortSignal.timeout(10_000) });
    assert(response.ok, '目标API健康读取失败');
    const health = await response.json();
    report.runningApi = { status: health.status, schemaVersion: health.schemaVersion, dependencies: health.dependencies };
    assert.equal(health.status, 'healthy', '目标API依赖未全部就绪');
  }
  const effective = (await dsa.effectiveControlPolicyV3()).projection?.effective;
  assert(effective?.enabled, '真实策略未启用');
  const requested = [
    { market: 'CN', timeframe: '1d', capability: 'DAILY_BAR', provider: 'tencent', source: 'tencent', symbol: '600519.SH' },
    { market: 'US', timeframe: '1m', capability: 'MINUTE_BAR', provider: 'futu', source: 'futu', symbol: 'AAPL.US' },
  ];
  for (const spec of requested) {
    const route = effective.routes.find(r => r.key.market === spec.market && r.key.assetType === 'STOCK'
      && r.key.timeframe === spec.timeframe && r.key.adjustment === 'none' && r.enabled !== false);
    const target = route?.targets.find(t => t.providerId === spec.provider && t.upstreamSource === spec.source && t.eligible)
      ?? route?.targets.find(t => t.eligible);
    assert(route && target, '代表口径未被当前策略选中或不合格');
    const session = await sessions.read(spec.market);
    assert(session.state !== 'unknown' && session.date, '代表市场日历未知');
    const day = session.state === 'open' ? session.date : session.latestCompletedTradingDate;
    assert(day, '日历没有最近完整交易日');
    const known = session.sessions.filter(s => s.tradingDate === day && Date.parse(s.endAt) <= Date.now()).at(-1);
    const stamp = spec.timeframe === '1d' ? `${day}T00:00:00+08:00`
      : new Date(Date.parse(known?.endAt ?? '') - 60_000).toISOString();
    assert(Number.isFinite(Date.parse(stamp)), '缺少受控分钟样本对应的已知会话');
    const input = { contractVersion: 3, purpose: 'interactive-chart', requestId: 'runtime-first', symbol: spec.symbol,
      routeKey: route.key, routeTarget: { providerId: target.providerId, upstreamSource: target.upstreamSource,
        routeIndex: target.routeIndex }, start: day, end: day };
    const scope = await controls.read({ capability: spec.capability, symbol: spec.symbol, purpose: 'interactive-chart',
      routeKey: input.routeKey, routeTarget: input.routeTarget, start: day, end: day });
    let loadCalls = 0;
    const load = async (request) => {
      loadCalls++;
      const at = new Date().toISOString();
      return marketChartBarsResponseV3Schema.parse({
        contractVersion: 3, purpose: request.purpose, requestId: request.requestId, symbol: request.symbol, routeKey: request.routeKey,
        bars: [{ ...fixture.bars[0], timestamp: stamp, availableAt: at, completionStatus: 'unknown' }],
        coverage: { requestedStart: day, requestedEnd: day, actualStart: stamp, actualEnd: stamp,
          hasMoreBefore: false, latestCompleteTradingDate: null },
        sourcePriceBasis: { ...fixture.sourcePriceBasis, adjustment: 'none', observedAt: at,
          methodVersion: 'controlled-runtime-cache-v1' },
        provenance: { ...input.routeTarget, effectivePolicyRevision: scope.context.policyRevision },
        inputFingerprint: fixture.inputFingerprint,
        ...(spec.timeframe !== '1d' ? { session: 'regular', timestampConvention: 'interval-start' } : {}),
      });
    };
    const read = (requestId, refresh = false) => {
      const request = { ...input, requestId };
      return cache.resolve(request, { limit: 90, refresh }, () => load(request));
    };
    const first = await read('runtime-first'); const hit = await read('runtime-hit');
    assert(!first.cached && hit.cached && loadCalls === 1, '重复读取没有复用实际Redis');
    assert.deepEqual(hit.response.sourcePriceBasis, first.response.sourcePriceBasis);
    assert.equal(hit.response.requestId, 'runtime-hit');
    assert(!(await read('runtime-refresh', true)).cached && loadCalls === 2, '刷新未跳过缓存');
    report.scopes.push({ market: spec.market, timeframe: spec.timeframe, symbol: spec.symbol,
      session: session.state, day, loadCalls, routeTarget: input.routeTarget, policyRevision: scope.context.policyRevision,
      generation: scope.context.generation, sourceTimePreserved: true, requestRebound: true, refreshBypassed: true });
  }
  report.providerPriceCalls = providerPriceCalls;
  report.cacheCodeSha256 = createHash('sha256').update(readFileSync(new URL('apps/server/dist/src/market/market-chart-result-cache.js', root))).digest('hex');
  report.passed = true;
} catch (error) {
  report.passed = false; report.errorType = error.name; report.errorCode = error.code ?? null;
  report.safeAssertion = error.name === 'AssertionError' ? error.message : null;
  process.exitCode = 1;
} finally { await redis.quit(); }
process.stdout.write(JSON.stringify(report) + '\n');
