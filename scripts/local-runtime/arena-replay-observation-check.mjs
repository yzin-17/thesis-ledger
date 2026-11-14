// 实际历史执行证据的只读小窗口；固定样本不修改任何比赛。
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

const args = process.argv.slice(2);
const value = (name) => { const i = args.indexOf(name); return i < 0 ? null : args[i + 1]; };
const matchId = value('--match'), at = value('--at'), output = value('--output');
const scope = value('--scope') ?? 'execution';
const query = value('--query');
assert(['bootstrap', 'execution', 'discovery'].includes(scope), 'scope 必须为 bootstrap、execution 或 discovery');
assert(scope !== 'discovery' || query && query.length <= 80, 'discovery 必须指定至多 80 字的 --query');
assert(matchId && /^[a-f0-9-]{36}$/.test(matchId) && at && Number.isFinite(Date.parse(at)) && output, '须指定 --match、--at、--output');
const execute = args.includes('--execute');
if (!execute) { console.log(JSON.stringify({ matchId, at, output, execute, scope, query, samples: scope === 'execution' ? ['600000.SH', '510300.SH'] : [] })); process.exit(0); }
const receiptPath = resolve(output);
await mkdir(dirname(receiptPath), { recursive: true });
await writeFile(receiptPath + '.permit', JSON.stringify({ matchId, at, scope, query }), { flag: 'wx', mode: 0o600 });
const [container] = JSON.parse(execFileSync('docker', ['inspect', 'thesis-ledger-dev-thesis-ledger-1'], { encoding: 'utf8' }));
assert(container.State.Running && container.Config.Labels['com.docker.compose.project'] === 'thesis-ledger-dev', '目标 Server 身份不符');
for (const entry of container.Config.Env) {
  const i = entry.indexOf('=');
  if (i > 0) process.env[entry.slice(0, i)] = entry.slice(i + 1);
}
process.env.DSA_BASE_URL = 'http://127.0.0.1:8000';
const detailResponse = await fetch(`http://127.0.0.1:3000/api/v1/arena-matches/${matchId}`, { signal: AbortSignal.timeout(15000) });
assert(detailResponse.ok, '无法读取本地比赛');
const detail = await detailResponse.json();
assert(detail.protocol.market === 'CN', '样本只支持本场 A 股协议');
const { DsaClient } = await import('../../apps/server/dist/src/integration/dsa/dsa.client.js');
const { MarketPeriodCalendarReader } = await import('../../apps/server/dist/src/market/market-period-calendar-reader.js');
const { MarketArenaHistorySource } = await import('../../apps/server/dist/src/market/market-arena-history-source.js');
const { MarketArenaReplayReader } = await import('../../apps/server/dist/src/market/market-arena-replay-reader.js');
const { MarketLifecycleReaderV3 } = await import('../../apps/server/dist/src/market/market-lifecycle-reader-v3.js');
const { MarketActionCoverage } = await import('../../apps/server/dist/src/market/market-action-coverage.js');
const dsa = new DsaClient(), diagnostics = [];
const facts = dsa.backtestInstrumentFacts.bind(dsa);
dsa.backtestInstrumentFacts = async (input) => {
  const result = await facts(input);
  diagnostics.push({ kind: 'instrument-facts', symbol: input.symbol, facts: result.facts.map((f) => ({
    symbol: f.symbol, availableAt: f.availableAt, lotSize: f.lotSize, tickSize: f.tickSize,
    tradable: f.tradable, executionRules: f.executionRules,
  })) });
  return result;
};
const source = new MarketArenaHistorySource(dsa), calendars = new MarketPeriodCalendarReader(dsa), status = new MarketLifecycleReaderV3(dsa);
const calendarRead = calendars.read.bind(calendars);
calendars.read = async (input) => {
  const result = await calendarRead(input);
  diagnostics.push({ kind: 'calendar', input, status: result.status, reason: result.reason,
    ...(result.status === 'ready' ? { availableAt: result.calendar.availableAt, sessions: result.calendar.sessions.length } : {}) });
  return result;
};
const composition = status.readComposition.bind(status);
status.readComposition = async (demands) => {
  const result = await composition(demands);
  diagnostics.push({ kind: 'execution-status', entries: result.entries.map((r) => ({ capability: r.query.routeKey.capability, status: r.status,
    ...(r.status === 'included' ? { clock: r.result.clock, coverage: r.result.coverage } : { reason: r.reason }) })) });
  return result;
};
const reader = new MarketArenaReplayReader(calendars, { readRetainedResearch: async () => null }, dsa, status, new MarketActionCoverage(dsa), source);
const results = [];
if (scope === 'discovery') {
  const items = await source.search(detail.protocol, query, at);
  results.push({ ready: true, query, items, pricesRead: false });
}
if (scope === 'bootstrap') {
  let minutes = 0, catalogs = 0;
  dsa.arenaHistoryMinutes = async () => { minutes++; throw new Error('启动不应读取分钟'); };
  dsa.arenaHistoryCatalog = async () => { catalogs++; throw new Error('启动不应读取目录全集'); };
  assert(detail.timeline?.originAt, '需要回放起点');
  try {
    const first = await reader.next(detail.protocol, detail.timeline.originAt, at);
    const observation = await reader.observe(detail.protocol, first, [], [], []);
    const executionFacts = diagnostics.filter((d) => d.kind !== 'calendar').length;
    assert.equal(minutes, 0); assert.equal(catalogs, 0); assert.equal(executionFacts, 0);
    assert.equal(observation.session.state, 'open'); assert.equal(observation.prices.size, 0);
    results.push({ ready: true, first, session: observation.session.state, minutes, catalogs, executionFacts });
  } catch (error) { results.push({ ready: false, reason: error.message, minutes, catalogs }); }
}
for (const [symbol, assetType] of scope === 'execution' ? [['600000.SH', 'STOCK'], ['510300.SH', 'ETF']] : []) {
  const protocol = { ...detail.protocol, universe: 'fixed', instruments: [{ instrumentId: randomUUID(), symbol, assetType }] };
  try {
    const observation = await reader.observe(protocol, at, [symbol]);
    results.push({ symbol, ready: true, at, session: observation.session.state, quotes: observation.context.quotes.map((q) => ({
      price: q.price, marketTime: q.marketTime, observedAt: q.observedAt, sourceRef: q.sourceRef,
    })) });
  } catch (error) { results.push({ symbol, ready: false, reason: /^replay_\w+_unavailable$/.test(error.message) ? error.message : 'source_not_qualified' }); }
}
const receipt = { matchId, at, scope, controlledUniverse: scope === 'execution', matchMutated: false, results, diagnostics, observedAt: new Date().toISOString() };
await writeFile(receiptPath, JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
console.log(JSON.stringify({ ...receipt, diagnostics: diagnostics.map((d) => ({ kind: d.kind, symbol: d.symbol, status: d.status, reason: d.reason, input: d.input, entries: d.entries?.map((i) => ({ capability: i.capability, status: i.status, reason: i.reason })), facts: d.facts?.map((f) => ({ symbol: f.symbol, tradable: f.tradable, rulesStatus: f.executionRules.status })) })) }));
if (results.some((r) => !r.ready)) process.exitCode = 1;
