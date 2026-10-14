import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

// 在目标 /app 下只读冻结产物，不执行 Runner，不保存或重新采集输入。
const require = createRequire(resolve(process.cwd(), 'package.json'));
const { tradingCalendarFromFact } = require('@thesis-ledger/domain');
const {
  marketCoverageProofV3Schema,
  backtestPublicFeesSnapshotV3Schema,
} = require('@thesis-ledger/schemas');
const { LocalSnapshotStore, hashCanonicalManifest } = await import(
  pathToFileURL(resolve(process.cwd(), 'apps/server/dist/src/backtest/backtest-snapshot.js'))
);
const [runId, symbol] = process.argv.slice(2);
assert(runId && ['600000.SH', '600519.SH'].includes(symbol), '需提供任务 ID 和标的');
let networkCalls = 0;
globalThis.fetch = async () => {
  networkCalls += 1;
  throw new Error('冻结产物核验禁止联网');
};
const store = new LocalSnapshotStore(
  process.env.BACKTEST_SNAPSHOT_ROOT ?? resolve(process.cwd(), 'var/backtest'),
);
const manifest = await store.v3.replay(runId);
assert.equal(manifest.status, 'finalized');
const rows = new Map();
for (const artifact of manifest.artifacts) {
  const values = [];
  for await (const row of await store.artifacts.openRead(artifact)) values.push(row);
  rows.set(artifact.key.slice(runId.length + 1), values);
}
const one = (key) => {
  const values = rows.get(key);
  assert.equal(values?.length, 1, key);
  return values[0];
};
const metadata = one('metadata/snapshot-metadata-v3.parquet');
const config = JSON.parse(metadata.runConfig);
const model = JSON.parse(one('metadata/execution-model-v3.parquet').model);
assert.deepEqual(model, config.executionModel);
assert.equal(hashCanonicalManifest(model), manifest.executionModel.contentHash);
assert.equal(config.frozenWarmupBudgetSessions, 5);
assert.equal(metadata.settlementCalendarPolicy, 'settlement-calendar-v1');
const evidence = one('metadata/market-window-evidence-v3.parquet');
const proof = marketCoverageProofV3Schema.parse(JSON.parse(evidence.coverageProof));
const request = JSON.parse(evidence.request);
assert.equal(request.start, '2023-07-08');
assert.equal(request.end, '2023-09-15');
assert.equal(request.symbol, symbol);
assert.equal(request.tradabilityMode, 'assume-untradable-no-bar');
assert.deepEqual(JSON.parse(evidence.frozenWindowRef), config.frozenExecutionWindow);
assert.deepEqual(manifest.frozenExecutionWindow, config.frozenExecutionWindow);
assert.equal(proof.pagination.pagesFetched, 1);
assert.equal(proof.pagination.continuationPending, false);
assert.equal(proof.window.status, 'complete');
if (symbol === '600519.SH') assert.deepEqual(proof.listing, { symbol, status: 'unknown' });
else assert.equal(proof.listing.firstTradingDate, '1999-11-10');
const bars = rows.get('execution/bars.parquet');
assert.equal(bars.length, 50);
assert(
  bars.every(
    (row) =>
      row.symbol === symbol && row.providerId === 'tencent' && row.effectivePolicyRevision === 40,
  ),
);
const dates = bars.map((row) => row.occurredAt.slice(0, 10));
assert.deepEqual(dates, proof.calendar.expectedSessionDates);
const warmupDates = dates.filter((date) => date < config.startDate);
const runDates = dates.filter((date) => date >= config.startDate && date <= config.endDate);
assert.equal(warmupDates.length, 16);
assert.equal(runDates.length, 34);
const calendarRow = one('calendar/CN.parquet');
const calendarFact = { ...calendarRow };
for (const key of ['range', 'sessions', 'sessionOverrides', 'holidays'])
  calendarFact[key] = JSON.parse(calendarFact[key]);
const calendar = tradingCalendarFromFact(calendarFact);
assert(calendarFact.range.end > config.endDate);
const cursor = new Date(`${config.endDate}T12:00:00.000Z`);
let settlementDate;
for (let attempt = 0; attempt < 20; attempt += 1) {
  cursor.setUTCDate(cursor.getUTCDate() + 1);
  const status = calendar.status(cursor);
  if (status.open) {
    settlementDate = status.date;
    break;
  }
}
assert.equal(settlementDate, '2023-09-18');
const fee = backtestPublicFeesSnapshotV3Schema.parse(
  JSON.parse(one('metadata/public-fees-v3.parquet').payload),
);
assert.equal(fee.disclosure.status, 'executionModel');
assert.equal(fee.modelContentHash, hashCanonicalManifest(model));
assert.deepEqual(model.scope.range, { start: config.startDate, end: config.endDate });
assert.equal(model.segments.length, 1);
assert.deepEqual(model.segments[0].range, model.scope.range);
const windows = JSON.parse(evidence.historicalTradabilityWindows);
assert(windows.every((window) => window.days.every((day) => day.state === 'observed-traded')));
assert.equal(networkCalls, 0);
console.log(
  JSON.stringify({
    runId,
    symbol,
    contentHash: manifest.contentHash,
    status: manifest.status,
    artifactCount: rows.size,
    networkCalls,
    request,
    frozenExecutionWindow: config.frozenExecutionWindow,
    priceCount: bars.length,
    warmupDates,
    runDates,
    missingSessionDates: [],
    listing: proof.listing,
    pagination: proof.pagination,
    provenance: JSON.parse(evidence.provenance),
    calendar: {
      provider: calendarFact.provider,
      providerRevision: calendarFact.providerRevision,
      availableAt: calendarFact.availableAt,
      range: calendarFact.range,
      settlementDate,
    },
    modelHash: hashCanonicalManifest(model),
    modelSource: model.segments[0].source,
    fees: fee,
    tradingStatus: JSON.parse(one('metadata/trading-status-v3.parquet').payload),
    barsDigest: createHash('sha256').update(JSON.stringify(bars)).digest('hex'),
  }),
);
