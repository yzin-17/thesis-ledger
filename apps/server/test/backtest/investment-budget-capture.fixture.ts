import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Prisma } from '@prisma/client';
import type { OptimizationDiscoveryProposal } from '@thesis-ledger/schemas';
import type { PrismaService } from '../../src/platform/prisma.service.js';
import type { ExperimentRow } from '../../src/strategy-optimization/strategy-optimization-common.js';
import { rowHash } from './investment-budget-frozen.fixture.js';

/** 只恢复本次隔离验收的导出记录，不生成、修补或再次请求模型输出。 */
export async function restoreInvestmentCapture(db: PrismaService, root: string, label: string) {
  assert(/^[a-z0-9-]+$/.test(label));
  const raw = readFileSync(resolve(root, label, 'records.json'), 'utf8');
  const records = JSON.parse(raw) as Record<string, Record<string, unknown>[]>;
  const tables = new Map([
    ['Strategy', records.strategies!],
    ['StrategyVersion', records.versions!],
    ['BacktestJob', records.runs!],
    ['AiRun', records.aiRuns!],
    ['OptimizationExperiment', records.experiments!],
    ['OptimizationCandidate', records.candidates!],
    ['OptimizationAttempt', records.attempts!],
  ]);
  const constraints = await db.$queryRaw<{ child: string; parent: string }[]>`
    SELECT child.relname AS child, parent.relname AS parent FROM pg_constraint c
    JOIN pg_class child ON child.oid=c.conrelid JOIN pg_class parent ON parent.oid=c.confrelid
    WHERE c.contype='f' AND child.relnamespace='public'::regnamespace`;
  const pending = new Map(tables);
  while (pending.size) {
    const ready = [...pending].filter(
      ([table]) =>
        !constraints.some((c) => c.child === table && c.parent !== table && pending.has(c.parent)),
    );
    assert(ready.length, '隔离导出表存在未支持的循环依赖');
    for (const [table, rows] of ready) {
      // 表名仅来自上面的固定白名单，值始终参数绑定。
      const identifier = Prisma.raw('"' + table + '"');
      for (const row of rows)
        await db.$executeRaw(Prisma.sql`
        INSERT INTO ${identifier} SELECT * FROM jsonb_populate_record(NULL::${identifier}, ${JSON.stringify(row)}::jsonb)`);
      pending.delete(table);
    }
  }
  const samples = [];
  for (const original of records.experiments!) {
    const attempt = records.attempts!.find(
      (a) => a.experimentId === original.id && a.status === 'succeeded',
    );
    const ai = records.aiRuns!.find((a) => a.id === attempt?.aiRunId && a.status === 'succeeded');
    if (!ai?.result) continue;
    const id = String(original.name).split(' ').at(-1)!;
    const configuration = JSON.parse(
      readFileSync(resolve(root, label, id + '-configuration.json'), 'utf8'),
    );
    const proposal = ai.result as OptimizationDiscoveryProposal;
    assert.deepEqual(proposal.strategy, configuration.strategy, '捕获配置与正式 AiRun 输出不同');
    const restored = await db.aiRun.findUniqueOrThrow({ where: { id: String(ai.id) } });
    assert.deepEqual(restored.result, ai.result);
    samples.push({
      id,
      experiment: original as unknown as ExperimentRow,
      proposal,
      aiRunId: String(ai.id),
      strategyHash: rowHash(proposal.strategy),
    });
  }
  assert(samples.length > 0, '没有可复核的成功模型输出');
  return { samples, recordsHash: rowHash(JSON.parse(raw)), source: label };
}
