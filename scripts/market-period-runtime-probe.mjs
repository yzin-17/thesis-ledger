import assert from 'node:assert/strict';

const root = process.env.TL_SERVER_RUNTIME_ROOT;
if (!root) throw new Error('需要明确的 Server 编译产物目录');
const { RedisService } = await import(`${root}/platform/redis.service.js`);
const { DsaClient } = await import(`${root}/integration/dsa/dsa.client.js`);
const { MarketPeriodCalendarReader } = await import(`${root}/market/market-period-calendar-reader.js`);
const { MarketPeriodReader } = await import(`${root}/market/market-period-reader.js`);
const { MarketPeriodViewCache } = await import(`${root}/market/market-period-view-cache.js`);
const { MarketPeriodIndicatorReader } = await import(`${root}/market/market-period-indicator-reader.js`);
const { periodContentFingerprint } = await import(`${root}/market/market-period-source.js`);
const { canonicalBarSeriesEncoding } = await import('@thesis-ledger/schemas');
const symbol = process.env.MARKET_PERIOD_SYMBOL ?? '159516.SZ';
const runId = crypto.randomUUID();
const namespace = `thesis-ledger:cache:v1:test:${runId}:`;
const keys = new Set();
const redis = new RedisService();
const scoped = { client: {
  get: (key) => redis.client.get(namespace + key),
  set: (key, value, ...args) => {
    keys.add(namespace + key);
    return redis.client.set(namespace + key, value, ...args);
  },
} };
const outcomes = [];
const requests = [{ name: 'MA', parameters: { period: 5 } }];
let actualSource;
const bars = { readChartV3: async (input) => {
  const query = new URLSearchParams({ ...input.window, timeframe: '1d', adjustment: 'qfq', assetType: 'ETF' });
  const response = await fetch(`http://127.0.0.1:3000/api/market/${symbol}/bars?${query}`, { signal: AbortSignal.timeout(90000) });
  assert.equal(response.status, 200);
  actualSource = await response.json();
  return actualSource;
} };

try {
  assert.equal(await redis.ping(), 'PONG');
  const dsa = new DsaClient();
  const calendars = new MarketPeriodCalendarReader(dsa);
  const reader = new MarketPeriodReader(calendars, bars);
  const input = {
    timeframe: '1w', limit: 2, indicators: requests,
    identity: { symbol, assetType: 'ETF', adjustment: 'qfq' },
    calendarRange: { start: '2024-01-01', end: '2026-12-31' },
  };
  const read = await reader.read(input);
  assert.equal(read.status, 'ready');
  const evaluationAsOf = read.view.visible.series.derivation.evaluationAsOf;
  const projected = await calendars.read({ market: 'CN', ...input.calendarRange, evaluationAsOf });
  assert.equal(projected.status, 'ready');
  const window = { timeframe: input.timeframe, limit: input.limit, indicators: requests, calendar: projected.calendar, evaluationAsOf };
  const first = await new MarketPeriodViewCache(scoped).resolve(actualSource, window);
  assert.equal(first.status, 'miss');
  const hit = await new MarketPeriodViewCache(scoped).resolve(actualSource, window);
  assert.equal(hit.status, 'hit');
  assert.deepEqual(hit.view, first.view);
  outcomes.push('实际 Reader 完整来源窗口与真实 Redis 跨实例命中');

  for (const change of ['source', 'calendar', 'clock', 'timeframe']) {
    const source = structuredClone(actualSource);
    const changed = structuredClone(window);
    if (change === 'source') {
      source.points[0].volume += 1;
      source.inputFingerprint = periodContentFingerprint(canonicalBarSeriesEncoding(source.identity, source.points));
    } else if (change === 'calendar') {
      changed.calendar.sessions[0].endAt = changed.calendar.sessions[0].endAt.replace('07:00:', '06:59:');
      changed.calendar.revision += ':controlled-session-change';
    } else if (change === 'clock') {
      changed.evaluationAsOf = new Date(Date.parse(evaluationAsOf) + 1).toISOString();
    } else {
      changed.timeframe = '1mo';
    }
    const next = await new MarketPeriodViewCache(scoped).resolve(source, changed);
    assert.equal(next.status, 'miss');
    assert.notEqual(next.view.visible.series.inputFingerprint, first.view.visible.series.inputFingerprint);
    outcomes.push(`实际输入副本受控变更 ${change} 不复用旧缓存`);
  }
  const key = [...keys][0];
  assert(key.startsWith(namespace));
  const corrupted = JSON.parse(await redis.client.get(key));
  corrupted.windows.visible.series.points[0].volume += 1;
  await redis.client.set(key, JSON.stringify(corrupted), 'EX', 60);
  const repaired = await new MarketPeriodViewCache(scoped).resolve(actualSource, window);
  assert.equal(repaired.status, 'miss');
  assert.deepEqual(repaired.view, first.view);
  outcomes.push('真实 Redis 仅本轮命名空间损坏，重验后重算');

  const calculator = new MarketPeriodIndicatorReader(dsa, scoped);
  const computed = await calculator.read(first.view, requests);
  assert.equal(computed.status, 'ready');
  assert.equal(computed.response.results[0].inputFingerprint, first.view.visible.series.inputFingerprint);
  const badDsa = new DsaClient();
  badDsa.config.dsaBaseUrl = 'http://127.0.0.1:1';
  const failed = await new MarketPeriodIndicatorReader(badDsa).read(first.view, requests, true);
  assert.deepEqual(failed, { status: 'unavailable', reason: 'indicator_unavailable' });
  outcomes.push('实际 DSA 成功与独立测试客户端真实连接故障分段降级');

  const disconnected = new RedisService();
  await disconnected.ping();
  disconnected.client.disconnect();
  const fallback = await new MarketPeriodViewCache(disconnected).resolve(actualSource, window);
  assert.equal(fallback.status, 'miss');
  assert.deepEqual(fallback.view, first.view);
  outcomes.push('独立测试 Redis 连接断开后，当前事实重算仍成功');
  console.log(JSON.stringify({ runId, symbol, evaluationAsOf, sourcePoints: actualSource.points.length,
    requestedWindow: actualSource.chartContextV3, calculationPoints: first.view.calculation.series.points.length,
    displayFingerprint: first.view.visible.series.inputFingerprint,
    calculationFingerprint: first.view.calculation.series.inputFingerprint, outcomes }, null, 2));
} finally {
  const owned = [...keys];
  assert(owned.every((key) => key.startsWith(namespace)));
  if (owned.length) await redis.client.del(...owned);
  await redis.onModuleDestroy();
}
