import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { assertIsolated, databaseUrl } from '../ai/ai-provider-postgres.fixture.js';
import { navPreparationFixture } from '../backtest/nav-preparation.fixtures.js';
import { StrategySubmissions } from '../../src/strategy-optimization/strategy-submissions.js';
import { strategySubmissionInputSchema } from '@thesis-ledger/schemas';

describe.skipIf(!databaseUrl)('回测与优化提交的数据库所有权', () => {
  it('重复点击只登记一次，关页后并发准备、显式核对与创建各执行一次', async () => {
    const db = new PrismaClient({ datasourceUrl: databaseUrl ?? '' });
    await assertIsolated(db);
    const source = navPreparationFixture();
    const input = strategySubmissionInputSchema.parse({ kind: 'nav', preparation: source.request });
    const boundary = {
      authorize: vi.fn(),
      requiresConfirmation: () => true,
      prepare: vi.fn(async () => ({ status: 'prepared', receipt: { preparationHash: 'proof' } })),
      create: vi.fn(async () => ({ id: randomUUID() })),
    };
    const worker = () => new StrategySubmissions(db as never, boundary as never);
    const owner = randomUUID(),
      id = randomUUID();
    try {
      await Promise.all([worker().submit(owner, id, input), worker().submit(owner, id, input)]);
      await expect(worker().submit(randomUUID(), id, input)).rejects.toThrow('不可访问');
      await Promise.all([worker().run(), worker().run()]);
      expect((await worker().list(owner))[0]?.state).toBe('awaiting_confirmation');
      expect(boundary.prepare).toHaveBeenCalledTimes(1);
      expect(boundary.create).not.toHaveBeenCalled();
      await Promise.all([worker().confirm(owner, id), worker().confirm(owner, id)]);
      await Promise.all([worker().run(), worker().run()]);
      expect((await worker().list(owner))[0]?.state).toBe('submitted');
      expect(boundary.create).toHaveBeenCalledTimes(1);
      await worker().run();
      expect(boundary.create).toHaveBeenCalledTimes(1);
      const interrupted = randomUUID();
      await worker().submit(owner, interrupted, input);
      await db.strategySubmission.update({
        where: { id: interrupted },
        data: { state: 'preparing', nextAt: new Date(0) },
      });
      await worker().run();
      expect((await db.strategySubmission.findUnique({ where: { id: interrupted } }))?.state).toBe(
        'blocked',
      );
      expect(boundary.prepare).toHaveBeenCalledTimes(1);
      const interruptedCreate=randomUUID(),versionId=randomUUID();
      const version=await db.strategy.create({data:{name:'隔离晚到回执',ownerId:owner,schemaVersion:2,
        versions:{create:{id:versionId,schemaVersion:2,version:1,schema:source.strategy}}},include:{versions:true}});
      expect(version.versions[0]?.id).toBe(versionId);
      const separate=strategySubmissionInputSchema.parse({kind:'nav',preparation:{...source.request,strategyVersionId:versionId}});
      await worker().submit(owner,interruptedCreate,separate);
      await db.strategySubmission.update({where:{id:interruptedCreate},data:{state:'creating',nextAt:new Date(0)}});
      await worker().run();
      expect((await db.strategySubmission.findUniqueOrThrow({where:{id:interruptedCreate}})).state).toBe('blocked');
      const late=await db.backtestJob.create({data:{strategyVersionId:versionId,status:'failed',input:{},periodStart:new Date(),periodEnd:new Date(),dataAsOf:new Date(),idempotencyKey:'strategy-submit:'+interruptedCreate}});
      await worker().run(new Date(Date.now()+3700000));
      expect(await db.strategySubmission.findUniqueOrThrow({where:{id:interruptedCreate}})).toMatchObject({state:'submitted',outcome:{id:late.id}});
      expect(boundary.create).toHaveBeenCalledTimes(1);
    } finally {
      await db.$disconnect();
    }
  });
});
