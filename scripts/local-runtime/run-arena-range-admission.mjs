import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ownsUpdateLock } from '../../../thesis-ledger-infra/scripts/runtime/lock.mjs';
import { allowHistoricalFetch } from './arena-historical-execution-check.mjs';
import { partitionValuations, inspectServer } from './run-arena-execution-admission.mjs';

export function sampledTargetAccount(execution, domain, days) {
  const { arenaSubmitDecision, arenaMatchOrders, arenaAvailableCash } = domain;
  const { symbol } = execution.fact, at = '2026-11-10T05:01:00.000Z', day = at.slice(0, 10);
  const nextDay = days[days.indexOf(day) + 1], followingDay = days[days.indexOf(day) + 2];
  assert(nextDay && followingDay);
  assert.equal(execution.tradingDay.state, 'trading');
  assert.equal(execution.rule.positionSettlement.sellableAfterTradingDays, 1);
  assert.equal(execution.rule.cashSettlement.sellCreditAfterTradingDays, 0);
  assert.deepEqual(execution.rule.statutoryCharges, []);
  let serial = 0;
  const quote = { symbol, price: '1', lot: execution.lot, tick: execution.tick,
    marketTime: at, observedAt: at, tradingDate: day, positionAvailableOn: nextDay, cashAvailableOn: day,
    sourceRef: 'controlled-archive-target-policy', buyBlocked: null, sellBlocked: null,
    statutoryBuyFee: () => '0', statutorySellFee: () => '0' };
  const context = { at, tradingDate: day, quotes: [quote],
    fees: { buyBps: 0, sellBps: 0, minimum: '0', slippageBps: 0 }, maxPositionBps: 10000, maxActiveSymbols: 20,
    allowedSymbols: new Set([symbol]), newId: () => `target-memory-${++serial}`, expiresAt: () => day + 'T07:00:00Z' };
  const empty = { revision: 0, cash: '10000', positions: [], cashSettlements: [], orders: [],
    wakeups: [], watchedSymbols: [], fills: [] };
  const decision = { summary: '目标受控账户政策', cancelOrderIds: [], watchedSymbols: [], wakeups: [{ kind: 'fill', symbol }],
    orders: [{ clientId: 'buy', symbol, side: 'buy', kind: 'market', quantity: execution.lot,
      price: null, expiresOn: null, exitGroup: null }] };
  const booked = arenaSubmitDecision(empty, 0, decision, context);
  const tickAt = new Date(Date.parse(at) + 60_000).toISOString();
  const filledContext = { ...context, at: tickAt, quotes: [{ ...quote, marketTime: tickAt, observedAt: tickAt }] };
  const bought = arenaMatchOrders(booked, filledContext, true);
  assert.equal(bought.fills.length, 1);
  assert.deepEqual(arenaMatchOrders(bought, filledContext, true), bought);
  const sell = { ...decision, orders: [{ ...decision.orders[0], clientId: 'sell', side: 'sell' }] };
  assert.throws(() => arenaSubmitDecision(bought, bought.revision, sell, filledContext), /insufficient_position/);
  const sellAt = nextDay + 'T05:01:00Z';
  const sellContext = { ...context, at: sellAt, tradingDate: nextDay, expiresAt: () => nextDay + 'T07:00:00Z',
    quotes: [{ ...quote, tradingDate: nextDay, cashAvailableOn: nextDay, positionAvailableOn: followingDay,
      marketTime: sellAt, observedAt: sellAt }] };
  const selling = arenaSubmitDecision(bought, bought.revision, sell, sellContext);
  const soldAt = nextDay + 'T05:02:00Z';
  const afterSell = { ...sellContext, at: soldAt,
    quotes: sellContext.quotes.map(q => ({ ...q, marketTime: soldAt, observedAt: soldAt })) };
  const sold = arenaMatchOrders(selling, afterSell, true);
  assert.equal(sold.fills.length, 2);
  assert.deepEqual(sold.positions, []);
  assert.deepEqual(sold.cashSettlements, []);
  assert.equal(arenaAvailableCash(sold, nextDay), sold.cash);
  assert.equal(sold.cash, empty.cash);
  const reinvest = { ...decision, orders: [{ ...decision.orders[0], clientId: 'reinvest' }] };
  assert.equal(arenaSubmitDecision(sold, sold.revision, reinvest, afterSell).orders.at(-1).state, 'active');
  return { status: 'passed', controlledQuotes: true, symbol, fills: 2,
    positionAvailableOn: nextDay, cashAvailableOn: day, reinvestmentState: 'active', cash: sold.cash };
}

export async function readRange(owner, expected, cutoff) {
  const before = await inspectServer(owner, false, cutoff);
  if (!expected) return before;
  const { DsaClient } = await import('./dist/src/integration/dsa/dsa.client.js');
  const { loadConfig } = await import('./dist/src/platform/config.js');
  const origin = new URL(loadConfig().dsaBaseUrl).origin;
  const original = globalThis.fetch, calls = [], results = [];
  try {
    globalThis.fetch = (url, init) => {
      allowHistoricalFetch(url, origin);
      assert(calls.length < 80);
      calls.push(new URL(url).pathname);
      return original(url, { ...init, redirect: 'error' });
    };
    const client = new DsaClient();
    for (const item of expected.filter(x => new Date(x.asOf).toISOString().endsWith('T05:01:00.000Z'))) {
      const result = await client.historicalExecution({ symbol: item.symbol, assetType: 'ETF', asOf: item.asOf,
        purpose: item.purpose ?? 'full' });
      assert.deepEqual(result, item.context, '正常消费者与独立资格结果不符');
      results.push({ symbol: item.symbol, asOf: item.asOf, context: result });
    }
    assert.equal(results.length, 22);
    const { readReplayExecutionEvidence } = await import('./dist/src/market/market-arena-replay-execution.js');
    const execution = await readReplayExecutionEvidence(client, { readComposition: async () => {
      throw new Error('ETF 不应调用股票状态组合');
    } }, { market: 'CN', currency: 'CNY', simulationPolicy: 'sampled-v1' },
    { symbol: '588000.SH', assetType: 'ETF' }, '2026-11-10T05:01:00.000Z', '2026-11-10T05:01:00.000Z', '2026-11-10');
    const days = [...new Set(results.map(item => item.asOf.slice(0, 10)))].sort();
    const accountCheck = sampledTargetAccount(execution, await import('@thesis-ledger/domain'), days);
    const after = await inspectServer(owner, false, cutoff);
    assert.deepEqual(after.business, before.business, '读回时业务或模型记录变化');
    return { ...after, results, calls, accountCheck };
  } finally { globalThis.fetch = original; }
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert(ownsUpdateLock(process.env.INFRA_UPDATE_LOCK_PATH ?? ''), '需要正式维护锁');
  const [output, mode = 'apply', ownerReceipt, baselineReceipt] = process.argv.slice(2);
  assert(['apply', 'verify', 'diagnose'].includes(mode) && process.argv.length <= 6);
  assert(resolve(output).startsWith(resolve(root, '.recovery-artifacts') + '/'));
  const ownerPath = resolve(root, ownerReceipt ?? '.recovery-artifacts/arena-v2-admission-deployment-20261116/queue-owner.json');
  assert(ownerPath.startsWith(resolve(root, '.recovery-artifacts') + '/'), '暂停归属回执必须位于私有目录');
  const owner = JSON.parse(readFileSync(ownerPath));
  assert.equal(owner.version, 'arena-maintenance-owner-v1');
  if (mode === 'apply') mkdirSync(output, { mode: 0o700 });
  if (mode === 'diagnose') mkdirSync(output, { mode: 0o700, recursive: true });
  const write = (name, value) => writeFileSync(resolve(output, name + '.json'), JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  const run = (args, input) => execFileSync('docker', args, { input, encoding: 'utf8', timeout: 90_000, maxBuffer: 12_000_000 }).trim();
  assert.equal(run(['context', 'show']), 'desktop-linux');
  let deploymentBaseline;
  if (baselineReceipt) {
    const path = resolve(root, baselineReceipt);
    assert(path.startsWith(resolve(root, '.recovery-artifacts') + '/'), '部署基线必须位于私有目录');
    deploymentBaseline = JSON.parse(readFileSync(path));
  }
  const permit = mode === 'verify' ? JSON.parse(readFileSync(resolve(output, 'apply-permit.json'))) : null;
  const cutoff = permit?.cutoff ?? permit?.at ?? deploymentBaseline?.cutoff ?? new Date().toISOString();
  assert(Number.isFinite(Date.parse(cutoff)), '原始业务基线时刻无效');
  const inspect = expected => JSON.parse(run(['exec', '-i', '-w', '/app/apps/server', 'thesis-ledger-dev-thesis-ledger-1',
    'node', '--input-type=module', '-', owner.token], `import assert from 'node:assert/strict';\n` +
    [allowHistoricalFetch, partitionValuations, inspectServer, sampledTargetAccount, readRange].map(fn => fn.toString()).join('\n') +
    `\nconsole.log(JSON.stringify(await readRange(process.argv[2],${JSON.stringify(expected)},${JSON.stringify(cutoff)})));`));
  const before = inspect(null);
  if (deploymentBaseline) {
    assert.deepEqual(before.business, deploymentBaseline.business, '部署前后原业务或模型记录变化');
    assert.deepEqual(before.jobs, deploymentBaseline.jobs, '原待办或活动任务变化');
  }
  write(mode === 'apply' ? 'before' : mode === 'diagnose' ? 'diagnostic-before' : 'verify-before', { ...before, cutoff });
  const dsaRoot = resolve(root, '../daily-stock-analysis');
  const helpers = readFileSync(resolve(dsaRoot, 'scripts/local-runtime/historical-execution-admission.py'), 'utf8').replace("if __name__ == '__main__':", 'if False:');
  const source = readFileSync(resolve(dsaRoot, 'scripts/local-runtime/historical-execution-range.py'), 'utf8').replace("if __name__ == '__main__':", 'if False:');
  const dsa = (mode, digest = null) => JSON.parse(run(['exec', '-i', '--user', 'dsa:dsa', 'thesis-ledger-dev-dsa-1',
    'python', '-B', '-'], helpers + '\n' + source + `\nprint(json.dumps(range_main(${JSON.stringify(mode === 'state'
      ? { mode, expected: 'dff009c696ce8e161268297fcf15c25ae69de72eb9ecb3aa0844cb7501cfc675' }
      : { mode, digest }).replace('null', 'None')}),ensure_ascii=False))`));
  if (mode === 'diagnose') {
    const control = dsa('state');
    write('diagnostic-control', control);
    console.log(JSON.stringify({ status: 'diagnosed', realModelCalls: 0, competitionOperations: 0 }));
    process.exit(0);
  }
  let collected;
  if (mode === 'apply') {
    collected = dsa('collect');
    write('collection', collected);
    write('apply-permit', { at: new Date().toISOString(), cutoff,
      evidenceSha256: collected.digest, sourceRevision: collected.control.revisions.sourceRevision });
    const admitted = dsa('apply', collected.digest);
    write('applied', admitted);
  } else {
    collected = JSON.parse(readFileSync(resolve(output, 'collection.json')));
  }
  const after = inspect(collected.results);
  assert.deepEqual(after.business, before.business, '准入期间原业务或模型记录变化');
  assert.deepEqual(after.business, JSON.parse(readFileSync(resolve(output, 'before.json'))).business,
    '原始准入基线以来的业务或模型记录变化');
  const verified = dsa('verify', collected.digest);
  const afterRead = inspect(null);
  assert.deepEqual(afterRead.business, before.business);
  const receipt = { status: 'passed', cutoff, completedAt: new Date().toISOString(), admission: verified,
    realModelCalls: 0, competitionOperations: 0, automaticRetries: 0, businessUnchanged: true,
    policyUnchanged: true, queuePaused: afterRead.queuePaused, jobs: afterRead.jobs,
    readback: after.results, calls: after.calls, accountCheck: after.accountCheck,
    backgroundValuationAppend: afterRead.valuationAppend,
    originalBusinessSha256: createHash('sha256').update(JSON.stringify(before.business)).digest('hex') };
  write(mode === 'apply' ? 'receipt' : 'verification-receipt', receipt);
  console.log(JSON.stringify({ status: receipt.status, readbacks: after.results.length,
    recordVersion: verified.record.recordVersion, scope: [verified.record.scopeDateFrom, verified.record.scopeDateTo],
    validUntil: verified.record.validUntil, realModelCalls: 0, competitionOperations: 0, queuePaused: true }));
}
