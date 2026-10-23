import { randomUUID } from 'node:crypto';
import { PrismaClient, type Prisma } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ResearchObservationStore } from '../../src/research/research-observation.store.js';
import { assertIsolated, databaseUrl } from '../ai/ai-provider-postgres.fixture.js';
import { observationFixture } from './research-observation.fixture.js';

/** 只连接维护脚本创建的隔离库；受控输入只证明存储行为，不授予日历或价格资格。 */
describe.skipIf(!databaseUrl)('观察版本与提交映射：隔离 PostgreSQL', () => {
  let first: PrismaClient, second: PrismaClient;
  let fixture: ReturnType<typeof observationFixture>;
  const store = (client = first) => new ResearchObservationStore(client as never);
  beforeAll(async () => {
    first = new PrismaClient({ datasourceUrl: databaseUrl ?? '' });
    second = new PrismaClient({ datasourceUrl: databaseUrl ?? '' });
    await assertIsolated(first);
    await assertIsolated(second);
  });
  beforeEach(async () => {
    await first.researchObservationSubmission.deleteMany();
    await first.researchObservationVersion.deleteMany();
    await first.researchObservation.deleteMany();
    fixture = observationFixture();
    await first.aiRun.create({ data: fixture.report.row as unknown as Prisma.AiRunCreateInput });
  });
  afterAll(async () => {
    await first?.researchObservationSubmission.deleteMany();
    await first?.researchObservationVersion.deleteMany();
    await first?.researchObservation.deleteMany();
    await first?.$disconnect();
    await second?.$disconnect();
  });

  it('两个连接十个同提交只允许一个尝试，完成后响应丢失始终找回同版本', async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) => store(i % 2 ? first : second).begin(fixture.start)),
    );
    expect(results.filter((result) => result.acquired)).toHaveLength(1);
    expect(await first.researchObservation.count()).toBe(1);
    expect(await first.researchObservationSubmission.count()).toBe(1);
    const saved = await store().finish(
      fixture.start.ownerId,
      fixture.start.submissionId,
      fixture.inputs,
      fixture.evaluation,
    );
    const replay = await store(second).begin(fixture.start);
    expect(replay.acquired).toBe(false);
    expect(replay.attempt).toEqual(saved);
    const late = await store(second).finish(
      fixture.start.ownerId,
      fixture.start.submissionId,
      {},
      {},
    );
    expect(late).toEqual(saved);
  });

  it('不同提交并发相同输入只保存一个版本，提交映射均保留', async () => {
    const starts = Array.from({ length: 8 }, () => ({
      ...fixture.start,
      submissionId: randomUUID(),
    }));
    await Promise.all(starts.map((input, i) => store(i % 2 ? first : second).begin(input)));
    const results = await Promise.all(
      starts.map((input, i) =>
        store(i % 2 ? first : second).finish(
          input.ownerId,
          input.submissionId,
          fixture.inputs,
          fixture.evaluation,
        ),
      ),
    );
    expect(new Set(results.map((result) => result.version?.id)).size).toBe(1);
    expect(await first.researchObservationVersion.count()).toBe(1);
    expect(await first.researchObservationSubmission.count()).toBe(8);
  });

  it('资料不足后追加完成版，晚到的旧截止版本不覆盖投影，旧版仍可读', async () => {
    await store().begin(fixture.start);
    const old = await store().finish(
      fixture.start.ownerId,
      fixture.start.submissionId,
      fixture.inputs,
      fixture.evaluation,
    );
    const newer = {
      ...fixture.start,
      submissionId: randomUUID(),
      visibleAt: '2026-10-26T08:00:00Z',
    };
    await store().begin(newer);
    const completed = await store().finish(
      newer.ownerId,
      newer.submissionId,
      { ...fixture.inputs, visibleAt: newer.visibleAt, prices: { revision: 'supplement-2' } },
      fixture.completed,
    );
    const delayed = {
      ...fixture.start,
      submissionId: randomUUID(),
      visibleAt: '2026-10-20T08:00:00Z',
    };
    await store(second).begin(delayed);
    await store(second).finish(
      delayed.ownerId,
      delayed.submissionId,
      { ...fixture.inputs, visibleAt: delayed.visibleAt },
      fixture.evaluation,
    );
    const [projection] = await store().readRun(
      newer.ownerId,
      newer.runId,
      new Date('2026-10-27T00:00:00Z'),
    );
    expect(projection?.current?.id).toBe(completed.version?.id);
    const [atOldCutoff] = await store().readRun(
      newer.ownerId,
      newer.runId,
      new Date(fixture.start.visibleAt),
    );
    expect(atOldCutoff?.current?.id).toBe(old.version?.id);
    const history = await store().history(newer.ownerId, newer.runId, old.observationId);
    expect(history.versions).toHaveLength(3);
    expect(history.versions.find((entry) => entry.id === old.version?.id)?.evaluation.status).toBe(
      'insufficient_data',
    );
  });

  it('同截止补充输入追加版本，同提交切换输入冲突且不留另一逻辑观察', async () => {
    await store().begin(fixture.start);
    const firstVersion = await store().finish(
      fixture.start.ownerId,
      fixture.start.submissionId,
      fixture.inputs,
      fixture.evaluation,
    );
    await expect(store().begin({ ...fixture.start, claimId: 'another-claim' })).rejects.toThrow(
      '提交标识已绑定',
    );
    expect(await first.researchObservation.count()).toBe(1);
    const next = { ...fixture.start, submissionId: randomUUID() };
    await store().begin(next);
    const secondVersion = await store().finish(
      next.ownerId,
      next.submissionId,
      { ...fixture.inputs, calendar: { revision: 'supplement-2' } },
      fixture.evaluation,
    );
    expect(secondVersion.version?.id).not.toBe(firstVersion.version?.id);
    expect(await first.researchObservationVersion.count()).toBe(2);
    await expect(
      store().begin({ ...fixture.start, visibleAt: '2026-10-27T08:00:00Z' }),
    ).rejects.toThrow('提交标识已绑定');
  });

  it('到期尝试收敛失败，晚到完成不能写版本，重试同提交不再领取', async () => {
    const pending = await store().begin(fixture.start);
    await first.researchObservationSubmission.updateMany({
      where: { submissionId: fixture.start.submissionId },
      data: { createdAt: new Date(Date.now() - 60_000), expiresAt: new Date(Date.now() - 1_000) },
    });
    const failed = await store().finish(
      fixture.start.ownerId,
      fixture.start.submissionId,
      fixture.inputs,
      fixture.evaluation,
    );
    expect(failed).toMatchObject({
      observationId: pending.attempt.observationId,
      state: 'failed',
      errorCode: 'attempt_expired',
      version: null,
    });
    expect((await store(second).begin(fixture.start)).acquired).toBe(false);
    expect(await first.researchObservationVersion.count()).toBe(0);
  });

  it('跨身份读取和完成不可见，数据库拒绝错误窗口及非法提交终态', async () => {
    const pending = await store().begin(fixture.start);
    const other = randomUUID();
    expect(await store().readRun(other, fixture.start.runId, new Date())).toEqual([]);
    await expect(
      store().history(other, fixture.start.runId, pending.attempt.observationId),
    ).rejects.toThrow('不可访问');
    await expect(store().finish(other, fixture.start.submissionId, {}, {})).rejects.toThrow(
      '不可访问',
    );
    await expect(
      first.researchObservation.update({
        where: { id: pending.attempt.observationId },
        data: { windowTradingDays: 7 },
      }),
    ).rejects.toThrow();
    await expect(
      first.researchObservationSubmission.updateMany({
        where: { submissionId: fixture.start.submissionId },
        data: { state: 'succeeded' },
      }),
    ).rejects.toThrow();
    expect(
      await first.aiRun.findUnique({
        where: { id: fixture.start.runId },
        select: { result: true },
      }),
    ).toEqual({ result: fixture.report.row.result });
  });
});
