import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
const { createCorrectnessHttpFixture } = await import('/app/apps/server/dist/test/performance/correctness-http-postgres.fixture.js');
console.log('P0_PROCESS ' + process.pid);
const fixture = await createCorrectnessHttpFixture();
const { LedgerV2Repository } = await import('/app/apps/server/dist/src/ledger/ledger-v2.repository.js');
const { CashLedgerCommandService } = await import('/app/apps/server/dist/src/ledger/cash-ledger-command.service.js');
const cash = new CashLedgerCommandService(new LedgerV2Repository(fixture.prisma));
let sequence = 0;
const flow = (accountId, direction, amount) => cash.createCashFlow({
  command: 'CREATE_CASH_FLOW', accountId, occurredAt: '2025-06-01T00:00:00.000Z',
  timePrecision: 'INSTANT', sourceTimezone: 'UTC', economicOrderKey: `p0-${String(++sequence).padStart(8, '0')}`,
  source: { category: 'MANUAL', channel: 'p0-target-synthetic', externalId: randomUUID() },
  actorId: 'p0-target', payload: { direction, category: direction === 'INFLOW' ? 'DEPOSIT' : 'WITHDRAWAL', amount, currency: 'CNY' },
});
const outcomes = [];
let closing = false;
process.on('SIGTERM', async () => {
  if (closing) return;
  closing = true;
  await fixture.close();
  process.exit(0);
});
try {
  const accountId = await fixture.account();
  const target = await fixture.request('/targets', { scope: 'account', accountId, targets: { stock: 0.5, cash: 0.5 } });
  assert.equal(target.status, 201);
  assert.equal(target.body.version, 1);
  const invalid = await fixture.request('/targets', { scope: 'portfolio', accountId, targets: { stock: 1 } });
  assert.equal(invalid.status, 400);
  assert.equal((await fixture.request(`/targets?scope=account&accountId=${accountId}`)).body.id, target.body.id);
  assert.equal(await fixture.prisma.targetAllocation.count({ where: { accountId, active: true } }), 1);
  outcomes.push('真实 targets HTTP 保存/读取成功；非法范围失败保留原活动版本');
  const concurrent = await fixture.account();
  const responses = await Promise.all(Array.from({ length: 6 }, (_, i) => fixture.request('/targets', {
    scope: 'account', accountId: concurrent, targets: { stock: i / 10, cash: 1 - i / 10 },
  })));
  assert(responses.every((item) => item.status === 201));
  const versions = await fixture.prisma.targetAllocation.findMany({ where: { accountId: concurrent }, orderBy: { version: 'asc' } });
  assert.deepEqual(versions.map((item) => item.version), [1, 2, 3, 4, 5, 6]);
  assert.equal(versions.filter((item) => item.active).length, 1);
  outcomes.push('六次 HTTP 竞争保存版本连续，活动版本唯一');
  await fixture.snapshotsFor(accountId, 220);
  await flow(accountId, 'INFLOW', '100');
  const snapshots = await fixture.prisma.portfolioSnapshot.findMany({ where: { accountId }, orderBy: { capturedAt: 'asc' } });
  const summary = await fixture.request(`/summary?accountId=${accountId}&mode=actual`);
  assert.equal(summary.status, 200);
  assert.equal(summary.body.ttwror, null);
  assert(summary.body.ttwrorReason.includes('边界'));
  assert(Number.isFinite(summary.body.xirr));
  assert.equal(summary.body.xirrReason, null);
  assert.deepEqual(await fixture.prisma.portfolioSnapshot.findMany({ where: { accountId }, orderBy: { capturedAt: 'asc' } }), snapshots);
  const netZeroId = await fixture.account();
  await fixture.snapshotsFor(netZeroId, 110);
  await flow(netZeroId, 'INFLOW', '100');
  await flow(netZeroId, 'OUTFLOW', '100');
  assert.equal((await fixture.request(`/summary?accountId=${netZeroId}&mode=actual`)).body.ttwror, null);
  const lossId = await fixture.account();
  await fixture.snapshotsFor(lossId, 10);
  const loss = await fixture.request(`/summary?accountId=${lossId}&mode=actual`);
  assert(Math.abs(loss.body.ttwror + 0.9) < 1e-12);
  assert(Number.isFinite(loss.body.xirr));
  assert(Math.abs(-100 + 10 / (1 + loss.body.xirr) ** (365 / 365.25)) < 1e-7);
  outcomes.push('缺现金流边界及零净额流量保持 TTWROR 未知；严重亏损 XIRR 有限且满足现金流方程；原快照不变');
  const calculated = await fixture.request('/calculate', {
    valuations: [{ date: '2025-01-01T00:00:00Z', value: 100 },
      { date: '2025-01-02T00:00:00Z', value: 200, externalFlow: 100, flowBoundary: { before: 100, after: 200 } },
      { date: '2025-01-03T00:00:00Z', value: 220 }],
    cashFlows: [{ date: '2025-01-01T00:00:00Z', amount: -100 }, { date: '2026-01-01T00:00:00Z', amount: 110 }],
  });
  assert.equal(calculated.status, 201);
  assert(Math.abs(calculated.body.ttwror - 0.1) < 1e-12);
  const allocation = { positions: [{ category: 'stock', marketValue: 500 }, { category: 'cash', marketValue: 500 }], targets: { stock: 1 } };
  const complete = await fixture.request('/allocation', allocation);
  assert.equal(complete.status, 201);
  assert(complete.body.rebalance.some((item) => item.category === 'cash' && item.amountGap === -500));
  const partial = await fixture.request('/allocation', { ...allocation, dataQuality: { partial: true, missingSymbols: ['CONTROLLED'] } });
  assert.equal(partial.status, 201);
  assert.deepEqual(partial.body.rebalance, []);
  outcomes.push('实际计算 HTTP 分段收益为 10%；再平衡保留现金，partial 输入拒绝建议');
  const layers = await fixture.request(`/layers?accountId=${accountId}&mode=actual`);
  assert.equal(layers.status, 200);
  assert.equal(layers.body.account.find((item) => item.accountId === accountId).cashValue, 100);
  const currentTargets = await fixture.request(`/targets?scope=account&accountId=${accountId}&mode=actual`);
  assert.equal(currentTargets.status, 200);
  assert.equal(currentTargets.body.version, 1);
  const envelopes = await fixture.prisma.ledgerEvent.findMany({ select: { envelopeVersion: true } });
  assert(envelopes.every((item) => item.envelopeVersion === 3));
  outcomes.push('现行现金命令写入当前信封，实际 layers/targets HTTP 读取成功，现金余额为 100 CNY');
  // 只在此独立验收进程中装配 HTTP；端口由运行时分配，宿主入口只转发此端口。
  const port = Number(new URL(fixture.origin).port);
  assert(port > 0, '独立验收服务必须明确监听端口');
  console.log('P0_READY ' + JSON.stringify({ pid: process.pid, port, accountId, lossId,
    summary: { ttwror: summary.body.ttwror, ttwrorReason: summary.body.ttwrorReason, xirr: summary.body.xirr }, outcomes }));
  // 保持服务供本机浏览器验收；维护入口结束后仅向本进程发送 SIGTERM。
  await new Promise(() => {});
} catch (error) {
  await fixture.close();
  throw error;
}
