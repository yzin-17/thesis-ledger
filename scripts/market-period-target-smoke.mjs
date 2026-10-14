import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  canonicalBarSeriesEncoding,
  canonicalMarketPeriodIndicatorEncoding,
  marketDisplayDetailResponseSchema,
  marketPeriodBarSeriesSchema,
  marketPeriodOptionsSchema,
} from '../packages/schemas/dist/index.js';
import { canonicalMarketPeriodEncoding } from '../packages/domain/dist/index.js';

const base = process.env.API_BASE_URL ?? 'http://127.0.0.1:3000';
const symbol = process.env.MARKET_PERIOD_SYMBOL ?? '159516.SZ';
const adjustment = process.env.MARKET_PERIOD_ADJUSTMENT ?? 'qfq';
const timeframes = ['5d', '1w', '1mo', '1y'];
const hash = (text) => createHash('sha256').update(text).digest('hex');
const records = [];

async function read(path, schema, expectedStatus = 200) {
  const started = performance.now();
  const response = await fetch(base + path, { signal: AbortSignal.timeout(90000) });
  const raw = await response.json();
  assert.equal(response.status, expectedStatus, path);
  const result = schema ? schema.parse(raw) : raw;
  records.push({ path, status: response.status, elapsedMs: Math.round(performance.now() - started) });
  return result;
}

function verifySeries(series, timeframe) {
  assert.equal(series.identity.symbol, symbol);
  assert.equal(series.identity.timeframe, timeframe);
  assert.equal(series.identity.adjustment, adjustment);
  assert.equal(series.provenance.kind, 'derived');
  assert.equal(series.provenance.provider, 'thesis-ledger-server');
  assert(series.points.length > 0, `${timeframe} requires actual points`);
  const aggregationFingerprint = hash(canonicalMarketPeriodEncoding({
    symbol,
    adjustment,
    priceBasisFingerprint: series.derivation.priceBasisFingerprint,
    kind: series.provenance.kind,
    provider: series.provenance.provider,
    providerRevision: series.provenance.providerRevision,
    timeframe,
    calendarRevision: series.derivation.calendarRevision,
    baseInputFingerprint: series.derivation.baseInputFingerprint,
    evaluationAsOf: series.derivation.evaluationAsOf,
    ...(series.derivation.anchorTradingDate ? { anchorTradingDate: series.derivation.anchorTradingDate } : {}),
    coverageEvidence: series.derivation.coverageEvidence,
    points: series.points,
  }));
  assert.equal(series.inputFingerprint, hash(canonicalMarketPeriodIndicatorEncoding({
    protocol: 'market-period-indicator-v1',
    aggregationFingerprint,
    pointFingerprint: hash(canonicalBarSeriesEncoding(series.identity, series.points)),
  })));
  for (const point of series.points) {
    if (point.completionStatus === 'complete') {
      assert(Date.parse(point.bucketEndAt) <= Date.parse(series.derivation.evaluationAsOf));
      assert.equal(point.missingTradingDates.length, 0);
    }
  }
  return {
    points: series.points.length,
    inputFingerprint: series.inputFingerprint,
    calendarRevision: series.derivation.calendarRevision,
    baseInputFingerprint: series.derivation.baseInputFingerprint,
    coverage: series.coverage,
    tailCompletion: series.points.at(-1).completionStatus,
    missingTradingDates: series.points.reduce((n, p) => n + p.missingTradingDates.length, 0),
  };
}

const health = await read('/api/v1/health');
assert.equal(health.status, 'healthy');
const summaries = [];
for (const barsLimit of [2, 30, 90]) {
  const options = await read(`/api/market/${symbol}/period-options?adjustment=${adjustment}&barsLimit=${barsLimit}`, marketPeriodOptionsSchema);
  assert.deepEqual(options.options.map((option) => option.timeframe), timeframes);
  for (const timeframe of timeframes) {
    const limit = timeframe === '1y' ? 2 : barsLimit;
    const option = options.options.find((item) => item.timeframe === timeframe);
    // 超限不是可得窗口；保留能力声明的具体原因，禁止缩短指标预热。
    if (!option.available) {
      summaries.push({ barsLimit, timeframe, availability: option.reason });
      continue;
    }
    const query = new URLSearchParams({ timeframe, adjustment, barsLimit: String(limit), include: 'bars,indicator:MA,indicator:MACD,indicator:RSI' });
    const detail = await read(`/api/market/${symbol}/detail?${query}`, marketDisplayDetailResponseSchema);
    const bars = detail.sections.bars;
    assert(bars && ['ready', 'stale'].includes(bars.status), `${timeframe}/${limit} bars unavailable`);
    assert(detail.barSeries);
    assert.equal(detail.barSeries.inputFingerprint, bars.data.inputFingerprint);
    const summary = verifySeries(detail.barSeries, timeframe);
    const indicators = {};
    for (const name of ['MA', 'MACD', 'RSI']) {
      const section = detail.sections[`indicator:${name}`];
      assert(section);
      if (timeframe === '1y') {
        assert.equal(section.status, 'unavailable');
        assert.match(section.error.code, /market_period_(calendar_input_limit|calendar_unavailable|base_input_limit)/);
        indicators[name] = { status: section.status, reason: section.error.code };
        continue;
      }
      assert(['ready', 'stale'].includes(section.status), `${timeframe}/${limit}/${name} unavailable`);
      const result = section.data;
      assert.equal(result.inputFingerprint, detail.barSeries.inputFingerprint);
      assert.deepEqual(result.points.map((p) => p.timestamp), detail.barSeries.points.map((p) => p.timestamp));
      assert(result.calculationInput.pointCount >= result.points.length);
      assert(Date.parse(result.calculationInput.actualStart) <= Date.parse(detail.barSeries.coverage.actualStart));
      assert.equal(result.calculationInput.actualEnd, detail.barSeries.coverage.actualEnd);
      if (result.calculationInput.pointCount > result.points.length)
        assert.notEqual(result.calculationInput.inputFingerprint, result.inputFingerprint);
      else
        assert.equal(result.calculationInput.inputFingerprint, result.inputFingerprint);
      indicators[name] = {
        status: section.status,
        calculationInput: result.calculationInput,
        nullPoints: result.points.filter((p) => Object.values(p.values).every((value) => value === null)).length,
      };
    }
    summaries.push({ barsLimit: limit, timeframe, ...summary, indicators });
  }
}
for (const timeframe of timeframes) {
  const series = await read(`/api/market/${symbol}/bars?timeframe=${timeframe}&adjustment=${adjustment}&limit=2`, marketPeriodBarSeriesSchema);
  summaries.push({ endpoint: 'bars', timeframe, ...verifySeries(series, timeframe) });
}
await read(`/api/market/${symbol}/period-options?barsLimit=0`, undefined, 400);
await read(`/api/market/${symbol}/detail?timeframe=wrong&include=bars`, undefined, 400);
await read('/api/market/110011/detail?timeframe=1w&include=bars', undefined, 422);
console.log(JSON.stringify({ checkedAt: new Date().toISOString(), symbol, adjustment, health, records, summaries }, null, 2));
