import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ownsUpdateLock } from '../../../thesis-ledger-infra/scripts/runtime/lock.mjs';
import { allowHistoricalFetch } from './arena-historical-execution-check.mjs';
import { partitionValuations, inspectServer } from './run-arena-execution-admission.mjs';
import { isolatedHistoricalTools } from './arena-isolated-roundtrip.mjs';

export async function prepareRange(mode, packet, token) {
  const { PrismaClient } = await import('@prisma/client');
  const { loadConfig } = await import('./dist/src/platform/config.js');
  const { DsaClient } = await import('./dist/src/integration/dsa/dsa.client.js');
  const origin = new URL(loadConfig().dsaBaseUrl).origin;
  const originalFetch = globalThis.fetch, cutoff = new Date().toISOString(), calls = [];
  const before = await inspectServer(token, false, cutoff), db = new PrismaClient();
  const results = [], errors = [];
  let runtime;
  try {
    globalThis.fetch = (url, init) => {
      allowHistoricalFetch(url, origin);
      assert(calls.length < 760, '超过有界数据请求预算');
      calls.push({ path: new URL(url).pathname, method: init?.method ?? 'GET' });
      return originalFetch(url, { ...init, redirect: 'error' });
    };
    if (mode === 'guard') {
      const { Redis } = await import('ioredis');
      const redis = new Redis(loadConfig().redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1 });
      let backtestJobs;
      try {
        backtestJobs = Object.fromEntries(await Promise.all(['active', 'wait', 'paused', 'delayed', 'prioritized', 'waiting-children']
          .map(async key => [key, await redis[['active', 'wait', 'paused'].includes(key) ? 'llen' : 'zcard']('bull:backtest-run:' + key)])));
        assert(Object.values(backtestJobs).every(x => x === 0), '恢复前回测队列必须无待执行任务');
      } finally { redis.disconnect(); }
      return { mode, status: 'passed', cutoff, realModelCalls: 0, competitionOperations: 0,
        queuePaused: before.queuePaused, jobs: before.jobs, backtestJobs,
        protectedTables: before.business, results: [], errors: [], calls };
    }
    const input = await db.$transaction(async tx => {
      await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
      const [row] = await tx.$queryRawUnsafe(`SELECT input FROM "ArenaLiveCycle"
        WHERE id='7e155817-ccfc-45bc-b812-01d9b8906beb'::uuid`);
      return row.input;
    });
    assert.equal(createHash('sha256').update(JSON.stringify(input)).digest('hex'),
      '1f8fd6a6dd243bba2c19e5cae1452e06a4f7eb1697c5e8d124472b39ef670d25');
    const dsa = new DsaClient();
    const calendar = await dsa.marketCalendar({ market: 'CN', start: '2026-10-19', end: '2026-11-30',
      dataAsOf: '2026-11-02T01:31:00.000Z' });
    if (mode === 'inventory') {
      const catalog = await dsa.marketRouteCatalogV3();
      results.push({ integrity: catalog.integrity, catalogRevision: catalog.catalogRevision,
        entries: catalog.entries.filter(r => r.key.market === 'CN' && r.key.assetType === 'ETF'
          && ['CASH_DISTRIBUTION', 'SPLIT_EVENT'].includes(r.key.capability)) });
    } else if (mode === 'events') {
      const { MarketActionCoverage } = await import('./dist/src/market/market-action-coverage.js');
      const actions = new MarketActionCoverage(dsa);
      const policy = await dsa.effectiveControlPolicyV3();
      const routes = policy.projection?.effective?.routes.filter(r => r.key.market === 'CN' && r.key.assetType === 'ETF'
        && ['CASH_DISTRIBUTION', 'SPLIT_EVENT'].includes(r.key.capability));
      for (const symbol of ['588000.SH', '510300.SH']) {
        const coverage = await actions.read({ symbol, assetType: 'ETF', market: 'CN', previousDay: packet.start,
          now: new Date(packet.end + 'T05:01:00Z') }, packet.end);
        results.push({ symbol, start: packet.start, end: packet.end, coverage, routes });
        if (!coverage) errors.push({ symbol, day: packet.end, reason: 'corporate_action_coverage_unavailable' });
      }
    } else if (mode !== 'minutes') runtime = await isolatedHistoricalTools();
    const days = ['events', 'inventory'].includes(mode) ? [] : packet.days;
    for (const day of days) for (const symbol of ['588000.SH', '510300.SH']) {
      try {
        if (mode === 'minutes') {
          const result = await dsa.arenaHistoryMinutes({ market: 'CN', date: day, symbol, assetType: 'ETF', timeframe: '1m' });
          results.push({ day, symbol, result });
        } else {
          const observations = [];
          for (const time of mode === 'holdings' ? ['13:01'] : ['09:31', '11:29', '11:30', '13:01', '14:59', '15:00', '21:00']) {
            const at = day + 'T' + time + ':00+08:00';
            const held = mode === 'holdings' ? [{ symbol, acquiredOn: '2026-11-02' }] : [];
            const read = await runtime.replay.observe(input.protocol, at, [symbol], held);
            const quote = read.context.quotes.find(q => q.symbol === symbol);
            assert(quote && Date.parse(quote.marketTime) <= Date.parse(at));
            if (time !== '21:00') assert.equal(Date.parse(quote.marketTime), Date.parse(at));
            if (time === '21:00') assert.equal(read.session.state, 'closed');
            observations.push({ at, quote: { ...quote, statutoryBuyFee: quote.statutoryBuyFee('10000'),
              statutorySellFee: quote.statutorySellFee('10000') }, session: read.session });
          }
          results.push({ day, symbol, observations });
        }
      } catch (error) { errors.push({ day, symbol, reason: error.message }); }
    }
    const after = await inspectServer(token, false, cutoff);
    assert.deepEqual(after.business, before.business, '原业务或模型记录发生变化');
    return { mode, status: errors.length ? 'blocked' : 'passed', cutoff, completedAt: new Date().toISOString(),
      realModelCalls: 0, competitionOperations: 0, automaticRetries: 0, businessUnchanged: true,
      queuePaused: after.queuePaused, jobs: after.jobs, backgroundValuationAppend: after.valuationAppend,
      protectedTables: before.business, calendar, results, errors, calls };
  } finally { globalThis.fetch = originalFetch; await runtime?.close(); await db.$disconnect(); }
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert(ownsUpdateLock(process.env.INFRA_UPDATE_LOCK_PATH ?? ''), '需要正式维护锁');
  const [mode, source, output] = process.argv.slice(2);
  assert(['guard', 'inventory', 'minutes', 'events', 'readback', 'holdings'].includes(mode) && process.argv.length === 5);
  assert(resolve(source).startsWith(resolve(root, '.recovery-artifacts') + '/'));
  assert(resolve(output).startsWith(resolve(root, '.recovery-artifacts') + '/'));
  const packet = JSON.parse(readFileSync(resolve(source, 'receipt.json')));
  assert.equal(packet.start, '2026-11-02');
  assert.equal(packet.end, '2026-11-16');
  assert.deepEqual(packet.days, ['2026-11-02','2026-11-03','2026-11-04','2026-11-05','2026-11-06',
    '2026-11-09','2026-11-10','2026-11-11','2026-11-12','2026-11-13','2026-11-16']);
  const owner = JSON.parse(readFileSync(resolve(root, '.recovery-artifacts/arena-v2-admission-deployment-20261116/queue-owner.json')));
  assert.equal(owner.version, 'arena-maintenance-owner-v1');
  mkdirSync(output, { mode: 0o700 });
  const code = `import assert from 'node:assert/strict';\nimport {createHash} from 'node:crypto';\n` +
    [allowHistoricalFetch, partitionValuations, inspectServer, isolatedHistoricalTools, prepareRange].map(fn => fn.toString()).join('\n') +
    `\nconsole.log(JSON.stringify(await prepareRange(process.argv[2],${JSON.stringify(packet)},process.argv[3])));`;
  const result = JSON.parse(execFileSync('docker', ['exec', '-i', '-w', '/app/apps/server',
    'thesis-ledger-dev-thesis-ledger-1', 'node', '--input-type=module', '-', mode, owner.token],
    { input: code, encoding: 'utf8', timeout: 600_000, maxBuffer: 16_000_000 }));
  writeFileSync(resolve(output, 'receipt.json'), JSON.stringify(result, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify({ mode, status: result.status, results: result.results.length, errors: result.errors,
    realModelCalls: 0, competitionOperations: 0, queuePaused: result.queuePaused }));
  if (result.errors.length) process.exitCode = 1;
}
