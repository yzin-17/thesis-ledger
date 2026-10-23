import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  researchObservationHistorySchema,
  researchObservationSubmissionResultSchema,
  researchReportObservationsSchema,
} from '@thesis-ledger/schemas';
import { assertIsolated, databaseUrl } from '../ai/ai-provider-postgres.fixture.js';
import { createObservationHttpFixture } from './research-observation-http.fixture.js';
import { observationMarketFixture } from './research-observation-market.fixture.js';

function useObservationHttpFixture() {
  let prisma: PrismaClient;
  let http: Awaited<ReturnType<typeof createObservationHttpFixture>>;
  async function clearObservations() {
    await prisma.researchObservationSubmission.deleteMany();
    await prisma.researchObservationVersion.deleteMany();
    await prisma.researchObservation.deleteMany();
  }
  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-30T08:00:01Z'));
    prisma = new PrismaClient({ datasourceUrl: databaseUrl ?? '' });
    await assertIsolated(prisma);
    http = await createObservationHttpFixture(prisma);
  });
  beforeEach(async () => {
    await clearObservations();
    http.reset();
    vi.stubEnv('STRATEGY_IDENTITY_MODE', undefined);
  });
  afterAll(async () => {
    await http?.close();
    if (prisma) await clearObservations();
    await prisma?.$disconnect();
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });
  return {
    get prisma() {
      return prisma;
    },
    get http() {
      return http;
    },
  };
}

describe.skipIf(!databaseUrl)('按需复核：真实 HTTP 与隔离 PostgreSQL', () => {
  const ctx = useObservationHttpFixture();

  it('小数秒提交先规范化，读取、计算与保存使用同一截止时点', async () => {
    const report = await ctx.http.seed();
    const sample = observationMarketFixture();
    sample.data.bars.at(-1)!.availableAt = '2026-11-30T08:00:00.000500000Z';
    ctx.http.prices.mockResolvedValueOnce(sample.selected);
    const input = ctx.http.input(report.claimId, '2026-11-30T16:00:00.000999999+08:00');
    const response = await ctx.http.post(report.id, input);
    expect(response.status).toBe(200);
    const saved = researchObservationSubmissionResultSchema.parse(await response.json());
    expect(saved.attempt.version?.inputs.visibleAt).toBe('2026-11-30T08:00:00.000Z');
    expect(saved.attempt.version?.evaluation).toMatchObject({
      status: 'insufficient_data',
      reasons: ['coverage_incomplete'],
      economic: { returnRate: null, directionMatched: null },
    });
    expect(ctx.http.calendar).toHaveBeenCalledWith(
      expect.objectContaining({ evaluationAsOf: '2026-11-30T08:00:00.000Z' }),
    );
    const read = researchReportObservationsSchema.parse(
      await (
        await ctx.http.get(report.id, {
          view: 'scoped',
          mode: 'shadow',
          asOf: '2026-11-30T16:00:00.000999999+08:00',
        })
      ).json(),
    );
    expect(read.asOf).toBe(saved.attempt.version?.inputs.visibleAt);
    expect(read.items[0]?.current).toEqual(saved.attempt.version);
  });

  it('只有显式提交读取资料，响应丢失重试找回原版本，原报告与 Journal 不变', async () => {
    const report = await ctx.http.seed();
    const input = ctx.http.input();
    const before = await ctx.prisma.aiRun.findUnique({ where: { id: report.id } });
    const journal = await ctx.prisma.journalEntry.findMany();
    expect((await ctx.http.get(report.id)).status).toBe(200);
    expect(ctx.http.calendar).not.toHaveBeenCalled();
    expect(ctx.http.prices).not.toHaveBeenCalled();
    const response = await ctx.http.post(report.id, input);
    expect(response.status).toBe(200);
    const saved = researchObservationSubmissionResultSchema.parse(await response.json());
    expect(saved.attempt.version?.evaluation).toMatchObject({
      status: 'completed',
      economic: { returnRate: '0.1', directionMatched: true },
    });
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(
      researchObservationSubmissionResultSchema.parse(
        await (await ctx.http.post(report.id, input)).json(),
      ),
    ).toEqual(saved);
    expect(ctx.http.calendar).toHaveBeenCalledTimes(1);
    expect(ctx.http.prices).toHaveBeenCalledTimes(1);
    const read = researchReportObservationsSchema.parse(
      await (await ctx.http.get(report.id)).json(),
    );
    expect(read.items[0]?.current?.id).toBe(saved.attempt.version?.id);
    expect(read.statistics).toMatchObject({
      samples: 1,
      calculatedSamples: 1,
      sampleStatus: 'insufficient',
      directionMatchRate: null,
    });
    expect(await ctx.prisma.aiRun.findUnique({ where: { id: report.id } })).toEqual(before);
    expect(await ctx.prisma.journalEntry.findMany()).toEqual(journal);
  });

  it('资料不足、补充完成与晚到未到期版依次保存，历史及当前投影各自可读', async () => {
    const report = await ctx.http.seed();
    ctx.http.calendar.mockResolvedValueOnce({
      status: 'unavailable',
      reason: 'calendar_unqualified',
    });
    const old = researchObservationSubmissionResultSchema.parse(
      await (await ctx.http.post(report.id, ctx.http.input())).json(),
    );
    expect(old.attempt.version?.evaluation.status).toBe('insufficient_data');
    expect(ctx.http.prices).not.toHaveBeenCalled();
    const completed = researchObservationSubmissionResultSchema.parse(
      await (await ctx.http.post(report.id, ctx.http.input())).json(),
    );
    expect(completed.attempt.version?.evaluation.status).toBe('completed');
    const late = researchObservationSubmissionResultSchema.parse(
      await (
        await ctx.http.post(report.id, ctx.http.input(report.claimId, '2026-10-25T08:00:00Z'))
      ).json(),
    );
    expect(late.attempt.version?.evaluation.status).toBe('not_due');
    const read = researchReportObservationsSchema.parse(
      await (await ctx.http.get(report.id)).json(),
    );
    expect(read.items[0]?.current?.id).toBe(completed.attempt.version?.id);
    const history = researchObservationHistorySchema.parse(
      await (await ctx.http.history(report.id, old.attempt.observationId)).json(),
    );
    expect(history.versions).toHaveLength(3);
    expect(
      history.versions.find((entry) => entry.id === old.attempt.version?.id)?.evaluation.status,
    ).toBe('insufficient_data');
  });

  it('跨 owner、错误模式、不存在报告及撤销权限在来源调用前被拒绝', async () => {
    const own = await ctx.http.seed(),
      foreign = await ctx.http.seed({ ownerId: randomUUID() });
    for (const response of [
      await ctx.http.post(foreign.id, ctx.http.input()),
      await ctx.http.post(randomUUID(), ctx.http.input()),
      await ctx.http.post(own.id, ctx.http.input(), { view: 'scoped', mode: 'actual' }),
    ])
      expect(response.status).toBe(404);
    ctx.http.revoke();
    expect((await ctx.http.post(own.id, ctx.http.input())).status).toBe(403);
    expect(ctx.http.calendar).not.toHaveBeenCalled();
    expect(ctx.http.prices).not.toHaveBeenCalled();
    expect(await ctx.prisma.researchObservationSubmission.count()).toBe(0);
  });
});

describe.skipIf(!databaseUrl)('按需复核的异常与谱系：真实 HTTP 与隔离 PostgreSQL', () => {
  const ctx = useObservationHttpFixture();

  it('资料读取期间权限撤销不保存观察，失败提交不能被晚到结果恢复', async () => {
    const report = await ctx.http.seed();
    const input = ctx.http.input();
    const original = ctx.http.calendar.getMockImplementation()!;
    ctx.http.calendar.mockImplementationOnce(async (...args) => {
      const value = await original(...args);
      ctx.http.revoke();
      return value;
    });
    expect((await ctx.http.post(report.id, input)).status).toBe(403);
    expect(await ctx.prisma.researchObservationVersion.count()).toBe(0);
    ctx.http.restore();
    const replay = researchObservationSubmissionResultSchema.parse(
      await (await ctx.http.post(report.id, input)).json(),
    );
    expect(replay.attempt.state).toBe('failed');
    expect(ctx.http.calendar).toHaveBeenCalledTimes(1);
  });

  it('来源异常成为有界失败，新提交及不适用论点保持各自语义', async () => {
    const report = await ctx.http.seed();
    const input = ctx.http.input();
    ctx.http.calendar.mockRejectedValueOnce(new Error('controlled read failure'));
    const failed = researchObservationSubmissionResultSchema.parse(
      await (await ctx.http.post(report.id, input)).json(),
    );
    expect(failed.attempt).toMatchObject({
      state: 'failed',
      errorCode: 'data_read_failed',
      version: null,
    });
    await ctx.http.post(report.id, input);
    expect(ctx.http.calendar).toHaveBeenCalledTimes(1);
    const manual = await ctx.http.seed({ qualitative: true });
    const result = researchObservationSubmissionResultSchema.parse(
      await (await ctx.http.post(manual.id, ctx.http.input(manual.claimId))).json(),
    );
    expect(result.attempt.version?.evaluation.status).toBe('not_applicable');
    expect(ctx.http.calendar).toHaveBeenCalledTimes(1);
    expect(
      (await ctx.http.post(report.id, { ...ctx.http.input(), asOf: '2026-12-01T00:00:00Z' }))
        .status,
    ).toBe(400);
  });

  it('两份重试报告和多个输入版本在真实统计查询中只计一个样本', async () => {
    const root = await ctx.http.seed();
    const retry = await ctx.http.seed({ retryOfRunId: root.id });
    await ctx.http.post(root.id, ctx.http.input());
    await ctx.http.post(retry.id, ctx.http.input());
    await ctx.http.post(retry.id, ctx.http.input());
    const read = researchReportObservationsSchema.parse(
      await (await ctx.http.get(retry.id)).json(),
    );
    expect(read.statistics).toMatchObject({
      samples: 1,
      dueSamples: 1,
      calculatedSamples: 1,
      directionMatchRate: null,
    });
    expect(await ctx.prisma.researchObservation.count()).toBe(2);
    expect(await ctx.prisma.researchObservationVersion.count()).toBe(2);
    expect(await ctx.prisma.researchObservationSubmission.count()).toBe(3);
  });
  it('V1 报告保持人工查看，未知字段不能触发自动复核或资料调用', async () => {
    const id = randomUUID();
    await ctx.prisma.aiRun.create({
      data: {
        id,
        provider: 'controlled-legacy',
        model: 'controlled',
        promptVersion: 'research-v1',
        status: 'succeeded',
        context: { scope: 'portfolio' },
        result: {
          version: 1,
          provider: 'controlled-legacy',
          createdAt: '2026-10-18T08:00:00Z',
          conclusion: '原历史报告',
          evidence: [],
          risks: [],
          unknowns: [],
          disclaimer: '受控历史样例',
        },
      },
    });
    const response = await ctx.http.get(id, { view: 'legacy' });
    expect(response.status).toBe(200);
    expect(researchReportObservationsSchema.parse(await response.json())).toMatchObject({
      availability: 'not_applicable',
      items: [],
      historicalScope: { status: 'unrecorded' },
    });
    expect((await ctx.http.post(id, ctx.http.input(), { view: 'legacy' })).status).toBe(400);
    expect(ctx.http.calendar).not.toHaveBeenCalled();
    expect(ctx.http.prices).not.toHaveBeenCalled();
  });
});
