import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';

// 只读原快照，在内存中改变明确列出的成本假设；不创建版本或任务。
async function overlay() {
  const assert = require('node:assert/strict');
  const { createHash } = require('node:crypto');
  const { PrismaClient } = require('@prisma/client');
  const { DecimalValue: D } = await import('@thesis-ledger/domain');
  const { LocalSnapshotStore } = await import('/app/apps/server/dist/src/backtest/backtest-snapshot.js');
  const { runExchangeVertical } = await import('/app/apps/server/dist/src/backtest/backtest-v2-execution-exchange.js');
  const p = new PrismaClient();
  try {
    const job = await p.backtestJob.findUniqueOrThrow({ where: { id: '9c7efea9-9242-494b-8bec-cef825ed4b1d' } });
    const version = await p.strategyVersion.findUniqueOrThrow({ where: { id: job.strategyVersionId } });
    const store = new LocalSnapshotStore(process.env.BACKTEST_SNAPSHOT_ROOT || '/app/var/backtest');
    const manifest = await store.v3.replay(job.id);
    const rows = new Map();
    for (const ref of manifest.artifacts) {
      const values = [];
      for await (const row of await store.artifacts.openRead(ref)) values.push(row);
      rows.set(ref.key, values);
    }
    const execution = [...rows.entries()].find(([key]) => key.endsWith('/execution/bars.parquet'))[1];
    const fingerprint = () => createHash('sha256').update(JSON.stringify(execution)).digest('hex');
    const before = fingerprint();
    const opens = new Map(execution.map(r => [r.occurredAt.slice(0, 10), r.open]));
    const results = [];
    for (const protection of [false, true]) {
      const strategy = structuredClone(version.schema), runConfig = structuredClone(job.runConfig);
      strategy.cost.slippageRate = '0.01';
      for (const segment of runConfig.executionModel.segments) segment.fees.commission = { treatment: 'charged', side: 'both', basis: 'turnover', currency: 'HKD', rate: '0.001', minimum: { kind: 'amount', amount: '10' } };
      delete strategy.tradePlan;
      if (protection) strategy.tradePlan = { version: 1, evaluation: 'barClose', stages: [], initialStop: { kind: 'percent', percent: '0.03' } };
      const result = runExchangeVertical({ runId: job.id, strategyVersionId: version.id, snapshotId: manifest.contentHash, strategy, runConfig, artifacts: manifest.artifacts, rows, engineVersion: 'investment-budget-controlled-overlay', marketRuleVersion: manifest.marketRuleVersion, calendarVersion: manifest.calendarVersion, aggregationVersion: manifest.aggregationVersion });
      let cash = D.from(runConfig.initialCash.HKD), held = D.from('0');
      const evidence = [];
      for (const fill of result.fills) {
        const open = opens.get(fill.occurredAt.slice(0, 10));
        assert(open);
        const equity = cash.plus(held.times(open));
        const fees = fill.charges.reduce((sum, c) => { assert.equal(c.currency, 'HKD'); return sum.plus(c.amount); }, D.from('0'));
        const turnover = D.from(fill.quantity).times(fill.price);
        if (fill.side === 'buy') {
          const total = turnover.plus(fees), cap = equity.times('0.5');
          assert(total.compareTo(cap) <= 0, fill.fillId + ' 超过含成本的50%');
          assert(fees.isPositive(), '正费用样本没有收取费用');
          assert(D.from(fill.price).compareTo(open) > 0, '正滑点样本没有应用滑点');
          evidence.push({ at: fill.occurredAt, quantity: fill.quantity, open, price: fill.price, fees: fees.toString(), outflow: total.toString(), cap: cap.toString() });
          cash = cash.minus(total); held = held.plus(fill.quantity);
        } else { cash = cash.plus(turnover).minus(fees); held = held.minus(fill.quantity); }
      }
      assert(evidence.length > 0);
      results.push({ protection, checkedBuys: evidence.length, first: evidence[0], totalFills: result.fills.length, evidence });
    }
    assert.deepEqual(results[0].first, results[1].first, '仅增加止损改变首次仓位');
    assert.equal(fingerprint(), before, '内存对照改变冻结行情');
    console.log(JSON.stringify({ status: 'succeeded', baseRunId: job.id, kind: 'controlled-memory-overlay', frozenRows: execution.length, frozenRowsHash: before, assumptions: { slippage: '0.01', commissionRate: '0.001', minimumCommissionHKD: '10' }, sameFirstAllocation: true, results }));
  } finally { await p.$disconnect(); }
}

const output = execFileSync('rtk', ['proxy', 'docker', 'exec', 'thesis-ledger-dev-thesis-ledger-1', 'node', '-e', `(${overlay.toString()})().catch(e=>{console.error(e.message);process.exitCode=1})`], { encoding: 'utf8', timeout: 120_000, maxBuffer: 4 * 1024 * 1024 });
const result = JSON.parse(output);
const receipt = '/tmp/investment-budget-overlay-20261115.json';
await writeFile(receipt, JSON.stringify(result, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
console.log(JSON.stringify({ status: result.status, receipt, frozenRows: result.frozenRows, sameFirstAllocation: result.sameFirstAllocation, checkedBuys: result.results.map(r => r.checkedBuys) }));
