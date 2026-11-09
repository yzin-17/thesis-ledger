import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { assertIsolated, databaseUrl } from '../ai/ai-provider-postgres.fixture.js';
import { preparationFailureFixture } from '../backtest/preparation-failure.fixture.js';
import { StrategySubmissions } from '../../src/strategy-optimization/strategy-submissions.js';
import { settleOrdinarySubmissionFailure } from '../../src/strategy-optimization/strategy-submission-failures.js';
import { isCurrentRunForRead } from '../../src/backtest/backtest-current-run-read.js';

describe.skipIf(!databaseUrl)('普通回测准备失败的事务与恢复', () => {
  it('并发准备、旧阻塞、异常及中断只创建一个失败任务；事务失败保留原记录', async () => {
    const db = new PrismaClient({ datasourceUrl: databaseUrl ?? '' });
    await assertIsolated(db);
    const { preparation, strategy, blocked } = await preparationFailureFixture();
    const ownerId = randomUUID();
    const s = await db.strategy.create({ data: { name: '隔离准备失败', schemaVersion: 2, ownerId,
      versions: { create: { id: preparation.strategyVersionId, schemaVersion: 2, version: 1, schema: JSON.parse(JSON.stringify(strategy)) } } } });
    const boundary = { authorize: vi.fn(), prepare: vi.fn(async () => blocked), create: vi.fn(), requiresConfirmation: () => false };
    const worker = () => new StrategySubmissions(db as never, boundary as never);
    const input = { kind: 'ordinary' as const, preparation };
    const ids: string[] = [];
    try {
      const current = randomUUID(); ids.push(current);
      await worker().submit(ownerId, current, input);
      await Promise.all([worker().run(), worker().run()]);
      const receipt = await db.strategySubmission.findUniqueOrThrow({ where: { id: current } });
      expect(receipt.state).toBe('submitted');
      const jobs = await db.backtestJob.findMany({ where: { strategyVersionId: preparation.strategyVersionId } });
      expect(jobs).toHaveLength(1); expect(isCurrentRunForRead(jobs[0]!)).toBe(true);
      expect(jobs[0]).toMatchObject({ status: 'failed', errorSummary: '主源未识别代码', snapshotId: null, runConfig: null, result: null, executionAttempt: 0 });
      expect(boundary.prepare).toHaveBeenCalledTimes(1); expect(boundary.create).not.toHaveBeenCalled();
      const original = await db.strategySubmission.findUniqueOrThrow({ where: { id: current } });
      await Promise.all([settleOrdinarySubmissionFailure(db as never, original, '失败'), settleOrdinarySubmissionFailure(db as never, original, '失败')]);
      expect(await db.backtestJob.count({ where: { strategyVersionId: preparation.strategyVersionId } })).toBe(1);

      for (const state of ['blocked', 'preparing']) {
        const id = randomUUID(); ids.push(id); await worker().submit(ownerId, id, input);
        await db.strategySubmission.update({ where: { id }, data: { state, nextAt: new Date(0), prepared: blocked, outcome: { reason: '原始准备失败' } } });
        await worker().run();
        expect((await db.strategySubmission.findUniqueOrThrow({ where: { id } })).state).toBe('submitted');
      }
      expect(boundary.prepare).toHaveBeenCalledTimes(1);
      boundary.prepare.mockRejectedValueOnce(new Error('准备请求暂不可用'));
      const exception = randomUUID(); ids.push(exception); await worker().submit(ownerId, exception, input); await worker().run();
      expect((await db.strategySubmission.findUniqueOrThrow({ where: { id: exception } })).state).toBe('submitted');

      const rollback = randomUUID(); ids.push(rollback); await worker().submit(ownerId, rollback, input);
      const row = await db.strategySubmission.findUniqueOrThrow({ where: { id: rollback } });
      await expect(settleOrdinarySubmissionFailure({ $transaction: (fn: (tx: unknown) => Promise<void>) => db.$transaction(async tx => {
        await fn(tx); throw new Error('controlled-rollback');
      }) } as never, row, '失败', blocked)).rejects.toThrow('controlled-rollback');
      expect((await db.strategySubmission.findUniqueOrThrow({ where: { id: rollback } })).state).toBe('queued');
      expect(await db.backtestJob.count({ where: { idempotencyKey: `strategy-submit:${rollback}` } })).toBe(0);
      await worker().run();
      expect((await db.strategySubmission.findUniqueOrThrow({ where: { id: rollback } })).state).toBe('submitted');

      const retained = randomUUID(); ids.push(retained); await worker().submit(ownerId, retained, input);
      const stale = await db.strategySubmission.update({ where: { id: retained }, data: { state: 'blocked', prepared: blocked } });
      await settleOrdinarySubmissionFailure(db as never, { ...stale, prepared: null }, '持久化恢复');
      expect((await db.backtestJob.findFirstOrThrow({ where: { idempotencyKey: `strategy-submit:${retained}` } })).diagnostics).toEqual(blocked);

      const denied = randomUUID(); ids.push(denied); await worker().submit(ownerId, denied, input);
      boundary.authorize.mockRejectedValueOnce(new Error('不可访问')).mockRejectedValueOnce(new Error('不可访问'));
      await worker().run();
      expect(await db.backtestJob.count({ where: { idempotencyKey: `strategy-submit:${denied}` } })).toBe(0);
    } finally {
      await db.strategySubmission.deleteMany({ where: { id: { in: ids } } });
      await db.backtestJob.deleteMany({ where: { strategyVersionId: preparation.strategyVersionId } });
      await db.strategyVersion.deleteMany({ where: { strategyId: s.id } });
      await db.strategy.delete({ where: { id: s.id } });
      await db.$disconnect();
    }
  });
});
