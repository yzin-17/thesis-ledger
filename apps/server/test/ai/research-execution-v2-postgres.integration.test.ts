import { randomUUID } from 'node:crypto';
import { PrismaClient, type Prisma } from '@prisma/client';
import { aiExecutionSummarySchema, researchResultV2Schema } from '@thesis-ledger/schemas';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AiResearchSubmissionV2 } from '../../src/ai/ai-research-submission-v2.js';
import { assertIsolated, databaseUrl } from './ai-provider-postgres.fixture.js';
import {
  controlledAccess,
  createResearchExecutionV2Harness,
} from './research-execution-v2.fixture.js';
import { submissionV2Fixture } from './research-submission-v2.fixture.js';

describe.skipIf(!databaseUrl)('研究 V2：真实隔离 PostgreSQL 与受控 SSE', () => {
  let prisma: PrismaClient;
  let harness: Awaited<ReturnType<typeof createResearchExecutionV2Harness>>;
  const owner = randomUUID();
  const stored = async (id: string) => {
    const run = await prisma.aiRun.findUniqueOrThrow({ where: { id } });
    const execution = aiExecutionSummarySchema.parse(
      (run.modelMetadata as Record<string, unknown>).sdkExecution,
    );
    return { run, execution };
  };
  beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: databaseUrl ?? '' });
    await assertIsolated(prisma);
    harness = await createResearchExecutionV2Harness(prisma);
  });
  beforeEach(async () => {
    await prisma.aiToolCall.deleteMany();
    await prisma.aiRun.deleteMany();
    await prisma.aiRoutingSettings.deleteMany();
    vi.stubEnv('AI_RESEARCH_V2_WRITES_ENABLED', 'true');
    harness.setMode('valid');
  });
  afterAll(async () => {
    vi.unstubAllEnvs();
    if (harness) {
      await harness.close();
      await prisma.aiToolCall.deleteMany();
      await prisma.aiRun.deleteMany();
    }
    await prisma?.$disconnect();
  });

  it('默认关闭只阻止新写入，已存任务仍按 V2 执行并由实际审计绑定来源', async () => {
    vi.stubEnv('AI_RESEARCH_V2_WRITES_ENABLED', undefined);
    const { frozen: unopened } = submissionV2Fixture();
    await expect(
      new AiResearchSubmissionV2(prisma as never).start(owner, unopened, controlledAccess),
    ).rejects.toMatchObject({ response: { code: 'RESEARCH_V2_WRITES_DISABLED' } });
    expect(await prisma.aiRun.count()).toBe(0);
    vi.stubEnv('AI_RESEARCH_V2_WRITES_ENABLED', 'true');
    const saved = await harness.seed(owner);
    vi.stubEnv('AI_RESEARCH_V2_WRITES_ENABLED', 'false');
    const reused = await harness.runs.startResearchV2(owner, saved.frozen, controlledAccess);
    expect(reused).toMatchObject({ reused: true, run: { id: saved.run.id } });
    await harness.execute(saved.run.id);
    const { run, execution } = await stored(saved.run.id);
    expect(run).toMatchObject({ status: 'succeeded', inputTokens: 8, outputTokens: 5 });
    const result = researchResultV2Schema.parse(run.result);
    const calls = await prisma.aiToolCall.findMany({ where: { aiRunId: run.id } });
    expect(calls).toHaveLength(1);
    expect(result.evidenceBindings).toEqual([
      { audit: saved.frozen.evidence[0]!.audit, toolCallId: calls[0]!.id },
    ]);
    expect(result).toMatchObject({
      inputFingerprint: saved.frozen.inputFingerprint,
      scopeSnapshot: saved.frozen.scopeSnapshot,
      model: { providerId: 'controlled-provider', modelId: 'controlled-model' },
    });
    expect(execution.requests).toHaveLength(1);
    expect(execution.requests[0]).toMatchObject({
      state: 'completed',
      settledRevision: 1,
      usageRevisions: [{ cost: { status: 'known', amount: '0.07', currency: 'USD' } }],
    });
    expect(harness.requests).toHaveLength(1);
    expect(harness.requests[0]).not.toHaveProperty('tools');
    await harness.execute(run.id);
    expect(harness.requests).toHaveLength(1);
    expect((await stored(run.id)).execution).toEqual(execution);
    const cancelled = await harness.runs.cancelResearchSubmissionV2(
      owner,
      saved.frozen.request,
      controlledAccess,
    );
    expect(cancelled.status).toBe('succeeded');
  });

  it('实际数值不符时不保存报告，保留已收到的 Token 和费用事实', async () => {
    harness.setMode('wrong-number');
    const saved = await harness.seed(owner);
    await harness.execute(saved.run.id);
    const { run, execution } = await stored(saved.run.id);
    expect(run).toMatchObject({
      status: 'failed',
      errorCode: 'research_business_invalid',
      result: null,
      inputTokens: 8,
      outputTokens: 5,
    });
    expect(execution.requests[0]).toMatchObject({
      state: 'completed',
      settledRevision: 1,
      error: { code: 'business_invalid' },
      usageRevisions: [{ cost: { status: 'known', amount: '0.07', currency: 'USD' } }],
    });
    expect(harness.requests).toHaveLength(1);
  });

  it('模型伪造来源审计或费用字段被严格合同拒绝', async () => {
    harness.setMode('forged-audit');
    const saved = await harness.seed(owner);
    await harness.execute(saved.run.id);
    const { run, execution } = await stored(saved.run.id);
    expect(run.status).toBe('failed');
    expect(run.result).toBeNull();
    expect(execution.requests[0]?.outcome?.schemaAccepted).toBe(false);
    expect(harness.requests).toHaveLength(1);
  });

  it.each(['fingerprint', 'routes', 'scope'] as const)(
    '损坏的 %s 在请求前失败，不能补取当前值',
    async (kind) => {
      const saved = await harness.seed(owner);
      const metadata = structuredClone(saved.run.modelMetadata) as Record<string, unknown>;
      if (kind === 'fingerprint')
        (metadata.frozenResearch as { inputFingerprint: string }).inputFingerprint = '0'.repeat(64);
      else if (kind === 'routes') delete metadata.researchRoutes;
      const snapshot =
        kind === 'scope'
          ? { ...saved.frozen.scopeSnapshot, mode: 'actual' }
          : saved.frozen.scopeSnapshot;
      await prisma.aiRun.update({
        where: { id: saved.run.id },
        data: { modelMetadata: metadata as Prisma.InputJsonValue, researchScopeSnapshot: snapshot },
      });
      await harness.execute(saved.run.id);
      const { run, execution } = await stored(saved.run.id);
      expect(run.status).toBe('failed');
      expect(execution.requests).toHaveLength(0);
      expect(harness.requests).toHaveLength(0);
    },
  );


});
