import assert from 'node:assert/strict';
import { MarketPeriodCalendarReader } from '../apps/server/dist/src/market/market-period-calendar-reader.js';
import { MarketPeriodReader } from '../apps/server/dist/src/market/market-period-reader.js';
import { MarketPeriodDisplayService } from '../apps/server/dist/src/market/market-period-display.service.js';
import { barSeriesSchema } from '../packages/schemas/dist/index.js';

const base = process.env.API_BASE_URL ?? 'http://127.0.0.1:3000';
const dsaBase = process.env.DSA_PROBE_BASE_URL ?? 'http://127.0.0.1:8000';
const symbol = process.env.MARKET_PERIOD_SYMBOL ?? '159516.SZ';
assert(process.env.THESIS_LEDGER_DSA_TOKEN, '需要既有 DSA 凭据，仅用于请求，不输出');
const reads = [];
const calendars = new MarketPeriodCalendarReader({ marketCalendar: async (input) => {
  const response = await fetch(`${dsaBase}/api/v3/thesis-ledger/market/calendar?${new URLSearchParams(input)}`, {
    headers: { authorization: `Bearer ${process.env.THESIS_LEDGER_DSA_TOKEN}` }, signal: AbortSignal.timeout(15000),
  });
  assert.equal(response.status, 200);
  return response.json();
} });
const reader = new MarketPeriodReader(calendars, { readChartV3: async (input) => {
  const query = new URLSearchParams({ ...input.window, timeframe: '1d', adjustment: input.identity.adjustment, assetType: input.identity.assetType });
  const response = await fetch(`${base}/api/market/${symbol}/bars?${query}`, { signal: AbortSignal.timeout(90000) });
  assert.equal(response.status, 200);
  const source = barSeriesSchema.parse(await response.json());
  reads.push({ timeframe: '1d', window: input.window, points: source.points.length, inputFingerprint: source.inputFingerprint });
  return source;
} });
const periods = new MarketPeriodDisplayService(calendars, reader, {});
const summaries = [];
for (const timeframe of ['5d', '1w', '1mo', '1y']) {
  const requests = timeframe === '1y' ? [] : [{ name: 'MA', parameters: { period: 5 } }];
  const view = await periods.read(symbol, timeframe, { assetType: 'ETF', adjustment: 'qfq', limit: '2' }, requests);
  assert(view.visible.series.points.length > 0);
  summaries.push({ timeframe, baseStart: view.plan.baseStart, baseEnd: view.plan.baseEnd,
    plannedDailyPoints: view.plan.dailyPointCount, warmup: view.plan.warmup,
    calculationPoints: view.calculation.series.points.length, visiblePoints: view.visible.series.points.length,
    displayFingerprint: view.visible.series.inputFingerprint, calculationFingerprint: view.calculation.series.inputFingerprint });
}
console.log(JSON.stringify({ checkedAt: new Date().toISOString(), symbol, reads, summaries }, null, 2));
