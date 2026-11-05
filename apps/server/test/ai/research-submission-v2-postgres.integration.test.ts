import { randomUUID } from 'node:crypto';
import { ForbiddenException } from '@nestjs/common';
import { type Prisma, PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AiResearchSubmissionV2Store,
  type AiResearchSubmissionV2Access,
} from '../../src/ai/ai-research-submission-v2.store.js';
import { assertIsolated, databaseUrl } from './ai-provider-postgres.fixture.js';
import { submissionV2Execution, submissionV2Fixture } from './research-submission-v2.fixture.js';

/** 只连接正式隔离入口创建的专用库，权限回答受控；没有模型或外部请求。 */
describe.skipIf(!databaseUrl)('V2 研究幂等提交：隔离 PostgreSQL', () => {
  let first: PrismaClient;
  let second: PrismaClient;
  const revoked = new Set<string>();
  const access: AiResearchSubmissionV2Access = {
    async assertSubmission(_transaction, ownerId) {
      if (revoked.has(ownerId)) throw new ForbiddenException('当前范围不可访问');
    },
    async assertSnapshot(_transaction, ownerId) {
      if (revoked.has(ownerId)) throw new ForbiddenException('原范围不可访问');
    },
  };
  const store = (prisma: PrismaClient) => new AiResearchSubmissionV2Store(prisma as never, access);
  beforeAll(async () => {
    first = new PrismaClient({ datasourceUrl: databaseUrl ?? '' });
    second = new PrismaClient({ datasourceUrl: databaseUrl ?? '' });
    await assertIsolated(first);
    await assertIsolated(second);
  });
  beforeEach(async () => {
    await first.aiRun.deleteMany();
    revoked.clear();
  });
  afterAll(async () => {
    await first?.$disconnect();
    await second?.$disconnect();
  });

  it('两个独立连接的十个并发提交只创建一条任务和一份执行配置', async () => {
    const owner = randomUUID();
    const { frozen } = submissionV2Fixture();
    const prepare = vi.fn(async () => submissionV2Execution());
    const submissions = await Promise.all(
      Array.from({ length: 10 }, (_, index) =>
        store(index % 2 === 0 ? first : second).submit(owner, frozen, prepare),
      ),
    );
    expect(new Set(submissions.map((value) => value.run.id)).size).toBe(1);
    expect(submissions.filter((value) => !value.reused)).toHaveLength(1);
    expect(await first.aiRun.count()).toBe(1);
    expect(prepare).toHaveBeenCalledTimes(1);
    const row = submissions[0]!.run;
    expect(row.researchScopeSnapshot).toEqual(frozen.scopeSnapshot);
    expect(row.modelMetadata).toMatchObject({ frozenResearch: frozen });
  });

  it('同提交异输入冲突，已完成/取消任务找回不创建新执行', async () => {
    const owner = randomUUID();
    const { input, frozen } = submissionV2Fixture();
    const saved = await store(first).submit(owner, frozen, async () => submissionV2Execution());
    await first.aiRun.update({
      where: { id: saved.run.id },
      data: { status: 'cancelled', completedAt: new Date() },
    });
    const later = structuredClone(frozen);
    later.evidence[0]!.data = { price: 999, currency: 'CNY' };
    const prepare = vi.fn(async () => submissionV2Execution());
    const reused = await store(second).submit(owner, later, prepare);
    expect(reused.run.id).toBe(saved.run.id);
    expect(reused.run.status).toBe('cancelled');
    expect(reused.run.modelMetadata).toEqual(saved.run.modelMetadata);
    expect(prepare).not.toHaveBeenCalled();
    await expect(store(second).find(owner, { ...input, question: '另一问题' })).rejects.toThrow(
      '提交标识已用于其他研究输入',
    );
    expect(await first.aiRun.count()).toBe(1);
  });

  it('身份隔离与权限撤销同时作用于找回路径', async () => {
    const owner = randomUUID(),
      otherOwner = randomUUID();
    const { input, frozen } = submissionV2Fixture();
    await store(first).submit(owner, frozen, async () => submissionV2Execution());
    expect(await store(second).find(otherOwner, input)).toBeNull();
    await store(second).submit(otherOwner, frozen, async () => submissionV2Execution());
    expect(await first.aiRun.count()).toBe(2);
    revoked.add(owner);
    await expect(store(second).find(owner, input)).rejects.toThrow('当前范围不可访问');
  });

  it('数据库直接拒绝重复身份，不依赖应用层查重', async () => {
    const owner = randomUUID();
    const { frozen } = submissionV2Fixture();
    const { run } = await store(first).submit(owner, frozen, async () => submissionV2Execution());
    await expect(
      second.aiRun.create({
        data: {
          provider: run.provider,
          model: run.model,
          promptVersion: run.promptVersion,
          status: 'queued',
          researchOwnerId: run.researchOwnerId,
          researchSubmissionId: run.researchSubmissionId,
          researchInputDigest: run.researchInputDigest,
          researchScopeSnapshot: run.researchScopeSnapshot as Prisma.InputJsonObject,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
    expect(await first.aiRun.count()).toBe(1);
  });

  it('数据库拒绝不完整身份、缺版本或 JSON null 快照，旧 V1 可保留空字段', async () => {
    await expect(
      first.aiRun.create({
        data: {
          provider: 'controlled',
          model: 'model',
          promptVersion: 'research-v2',
          status: 'queued',
          researchOwnerId: randomUUID(),
        },
      }),
    ).rejects.toThrow();
    const legacy = await first.aiRun.create({
      data: {
        provider: 'controlled',
        model: 'model',
        promptVersion: 'research-v1',
        status: 'succeeded',
        context: { scope: 'portfolio' },
      },
    });
    expect(legacy.researchScopeSnapshot).toBeNull();
    const { frozen } = submissionV2Fixture();
    const { run } = await store(first).submit(randomUUID(), frozen, async () =>
      submissionV2Execution(),
    );
    await expect(
      first.$executeRaw`UPDATE "AiRun" SET "researchScopeSnapshot" = 'null'::jsonb WHERE id = ${run.id}::uuid`,
    ).rejects.toThrow();
    await expect(
      first.$executeRaw`UPDATE "AiRun" SET "researchScopeSnapshot" = '{"mode":"shadow","scope":"instrument"}'::jsonb WHERE id = ${run.id}::uuid`,
    ).rejects.toThrow();
    await expect(
      first.$executeRaw`UPDATE "AiRun" SET "researchInputDigest" = 'invalid' WHERE id = ${run.id}::uuid`,
    ).rejects.toThrow();
    expect(
      (await first.aiRun.findUniqueOrThrow({ where: { id: run.id } })).researchScopeSnapshot,
    ).toEqual(frozen.scopeSnapshot);
  });

  it('配置准备失败会回滚同一事务内的写入', async () => {
    const { frozen } = submissionV2Fixture();
    await expect(
      store(first).submit(randomUUID(), frozen, async (transaction) => {
        await transaction.aiRun.create({
          data: {
            provider: 'controlled',
            model: 'model',
            promptVersion: 'controlled-rollback',
            status: 'queued',
          },
        });
        throw new Error('受控配置失效');
      }),
    ).rejects.toThrow('受控配置失效');
    expect(await first.aiRun.count()).toBe(0);
  });
});
