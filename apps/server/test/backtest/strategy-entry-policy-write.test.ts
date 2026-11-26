import { expect, it, vi } from 'vitest';
import { materializeEntryPolicy } from '@thesis-ledger/domain';
import { StrategyCreationService } from '../../src/backtest/strategy-creation.service.js';
import { publishManualStrategyVersion } from '../../src/backtest/strategy-version-publication.js';
import { fixedAuthoringPlan } from './trade-plan-authoring-content.fixture.js';
import { dailyOrderStrategy, dailyOrderSnapshot } from './daily-order-worker.fixture.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

it('全新策略默认保存显式边沿政策，不能因附带保护变成空仓政策', async () => {
  const schema = fixedAuthoringPlan(false), before = JSON.stringify(schema);
  const tx = { strategy: { create: vi.fn(async (input) => input) } };
  await new StrategyCreationService().createInTransaction(tx as never, { ownerId: null, name: schema.name, definition: schema, source: { kind: 'manual' } });
  expect(tx.strategy.create.mock.calls[0]![0].data.versions.create.schema.entryTrigger).toBe('rising-edge');
  expect(JSON.stringify(schema)).toBe(before);
});
it('发布版本缺少显式政策时在事务前拒绝，不能依据已经修改的保护倒推', async () => {
  const prisma = { $transaction: vi.fn() };
  await expect(publishManualStrategyVersion(prisma as never, 'strategy', fixedAuthoringPlan(false)))
    .rejects.toMatchObject({ response: { code: 'STRATEGY_ENTRY_TRIGGER_REQUIRED' } });
  expect(prisma.$transaction).not.toHaveBeenCalled();
});
it('旧有效计划先投影空仓政策，之后发布删保护的新版本仍保存原政策', async () => {
  const original = fixedAuthoringPlan(false), before = JSON.stringify(original);
  const projected = materializeEntryPolicy(original); delete projected.tradePlan;
  const tx = { $executeRaw: vi.fn(async () => 1), strategy: { findUnique: vi.fn(async () => ({ schemaVersion: 1 })) },
    strategyVersion: { aggregate: vi.fn(async () => ({ _max: { version: 2 } })), create: vi.fn(async (input) => input.data) } };
  const prisma = { $transaction: (work: (client: typeof tx) => unknown) => work(tx) };
  const result = await publishManualStrategyVersion(prisma as never, 'strategy', projected);
  expect(result).toMatchObject({ version: 3, schema: { entryTrigger: 'while-flat' } });
  expect(JSON.stringify(original)).toBe(before);
});

it.each(['rising-edge', 'while-flat'] as const)('正式冻结Runner贯通显式政策，限价到期时产生不同委托数：%s', async (policy) => {
  const root = await mkdtemp(join(tmpdir(), 'entry-policy-runner-'));
  try {
    const strategy = await dailyOrderStrategy(false);
    strategy.entryTrigger = policy;
    if (strategy.execution.timing !== 'dailyBarOrders') throw new Error('fixture');
    strategy.execution.orders[0]!.validity = { kind: 'bars', bars: 1 };
    strategy.execution.orders[0]!.order = { kind: 'limit', price: { type: 'constant', value: '1' } };
    const f = await dailyOrderSnapshot(root, false, strategy), result = await f.run();
    expect(result.simulationFills).toEqual([]);
    expect(result.dailyOrders?.orders.filter((order) => order.templateId === 'buy')).toHaveLength(policy === 'while-flat' ? 2 : 1);
    expect(await f.run()).toEqual(result);
  } finally { await rm(root, { recursive: true, force: true }); }
});
