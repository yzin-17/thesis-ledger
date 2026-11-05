import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { researchSubmissionReceiptV2Schema } from '@thesis-ledger/schemas';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { assertIsolated, databaseUrl } from '../ai/ai-provider-postgres.fixture.js';
import { verifyAiFrozenResearchV2 } from '../../src/ai/ai-research-frozen-integrity-v2.js';
import { createResearchSubmissionPostgresHarness } from './research-submission-postgres.fixture.js';
import { researchFixtureNow } from './research-data-http.fixture.js';

describe.skipIf(!databaseUrl)('研究准备提交：HTTP、真实 Prisma 与受控数据 HTTP', () => {
  let prisma: PrismaClient;
  let harness: Awaited<ReturnType<typeof createResearchSubmissionPostgresHarness>>;
  let input: ReturnType<typeof harness.input>;
  const instrumentId = '00000000-0000-4000-8000-000000000001';
  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(researchFixtureNow));
    prisma = new PrismaClient({ datasourceUrl: databaseUrl ?? '' });
    await assertIsolated(prisma);
    harness = await createResearchSubmissionPostgresHarness(prisma);
  });
  beforeEach(async () => {
    await prisma.aiToolCall.deleteMany();
    await prisma.aiRun.deleteMany();
    await prisma.aiRoutingSettings.deleteMany();
    await prisma.instrument.upsert({
      where: { id: instrumentId },
      create: {
        id: instrumentId,
        market: 'SH',
        instrumentType: 'STOCK',
        canonicalCode: '600519',
        displayName: '受控规范标的',
        generation: 1,
      },
      update: { active: true, generation: 1 },
    });
    vi.stubEnv('STRATEGY_IDENTITY_MODE', undefined);
    vi.stubEnv('AI_RESEARCH_V2_WRITES_ENABLED', 'true');
    vi.stubEnv('AI_RESEARCH_PREPARATION_TIMEOUT_MS', '30000');
    vi.stubEnv('AI_RESEARCH_POLICY_JSON', undefined);
    harness.data.setMode('available');
    harness.models.setMode('valid');
    harness.redis.clear();
    harness.dispatch.dispatch.mockClear();
    harness.dispatch.cancelActive.mockClear();
    input = harness.input((await harness.models.configureDefault()).revision);
  });
  afterAll(async () => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
    if (harness) {
      await harness.close();
      await prisma.aiToolCall.deleteMany();
      await prisma.aiRun.deleteMany();
      await prisma.instrument.deleteMany({ where: { id: instrumentId } });
    }
    await prisma?.$disconnect();
  });

  it('缺少已验证身份时不准备、创建或请求任何数据', async () => {
    vi.stubEnv('STRATEGY_IDENTITY_MODE', 'account');
    const response = await harness.post(input);
    expect(response.status).toBe(401);
    expect(harness.data.calls).toHaveLength(0);
    expect(await prisma.aiRun.count()).toBe(0);
  });
  it.each([{ ownerId: randomUUID() }, { mode: 'invalid' }, { sdkExecution: {} }])(
    '严格 body 拒绝伪造字段或错误模式：%j',
    async (fields) => {
      const response = await harness.post({ ...input, ...fields });
      expect(response.status).toBe(400);
      expect(harness.data.calls).toHaveLength(0);
      expect(await prisma.aiRun.count()).toBe(0);
    },
  );
  it('并发相同提交只保存一次并投递一次；准备本身不请求模型', async () => {
    const responses = await Promise.all(Array.from({ length: 3 }, () => harness.post(input)));
    expect(responses.map((response) => response.status)).toEqual([200, 200, 200]);
    expect(responses[0]!.headers.get('cache-control')).toBe('no-store');
    const receipts = await Promise.all(
      responses.map(async (response) =>
        researchSubmissionReceiptV2Schema.parse(await response.json()),
      ),
    );
    expect(new Set(receipts.map((value) => value.runId)).size).toBe(1);
    expect(receipts.filter((value) => !value.reused)).toHaveLength(1);
    expect(harness.dispatch.dispatch).toHaveBeenCalledOnce();
    expect(await prisma.aiRun.count()).toBe(1);
    const run = await prisma.aiRun.findUniqueOrThrow({ where: { id: receipts[0]!.runId } });
    const frozen = verifyAiFrozenResearchV2(
      (run.modelMetadata as Record<string, unknown>).frozenResearch,
    );
    expect(frozen.scopeSnapshot).toEqual(receipts[0]!.scopeSnapshot);
    expect(
      frozen.evidence.filter((entry) => entry.usable).map((entry) => entry.audit.kind),
    ).toEqual(['quote', 'news']);
    expect(frozen.evidence[0]!.audit).toMatchObject({ policyRevision: null, routeRevision: null });
    expect(harness.data.calls.every((call) => call.dataAuthorized)).toBe(true);
    for (const call of harness.data.calls) {
      const body = JSON.stringify(call.body);
      expect(body).not.toContain('accountId');
      expect(body).not.toContain('question');
      expect(body).not.toContain('submissionId');
    }
    expect(harness.models.requests).toHaveLength(0);
  });
  it('已提交响应丢失可按原标识找回并取消，不重新取数或改写旧目录快照', async () => {
    const created = researchSubmissionReceiptV2Schema.parse(
      await (await harness.post(input)).json(),
    );
    const calls = harness.data.calls.length;
    vi.stubEnv('AI_RESEARCH_V2_WRITES_ENABLED', 'false');
    await prisma.instrument.update({
      where: { id: instrumentId },
      data: { generation: 2, active: false },
    });
    const found = researchSubmissionReceiptV2Schema.parse(
      await (await harness.post(input, '/find')).json(),
    );
    expect(found).toMatchObject({ runId: created.runId, scopeSnapshot: created.scopeSnapshot });
    const cancelled = researchSubmissionReceiptV2Schema.parse(
      await (await harness.post(input, '/cancel')).json(),
    );
    expect(cancelled).toMatchObject({ runId: created.runId, status: 'cancelled' });
    expect(harness.dispatch.cancelActive).toHaveBeenCalledExactlyOnceWith(created.runId);
    expect(harness.data.calls).toHaveLength(calls);
    expect(harness.models.requests).toHaveLength(0);
  });
  it('持有他人的提交标识不能找回或取消其任务', async () => {
    const created = researchSubmissionReceiptV2Schema.parse(
      await (await harness.post(input)).json(),
    );
    await prisma.aiRun.update({
      where: { id: created.runId },
      data: { researchOwnerId: randomUUID() },
    });
    expect((await harness.post(input, '/find')).status).toBe(404);
    expect((await harness.post(input, '/cancel')).status).toBe(404);
    expect((await prisma.aiRun.findUniqueOrThrow({ where: { id: created.runId } })).status).toBe(
      'queued',
    );
  });
  it('必需新闻未准入时保留准确原因，不以成功空结果创建任务', async () => {
    harness.data.setMode('not_admitted');
    const response = await harness.post({ ...input, templateId: 'counter-evidence' });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      code: 'RESEARCH_REQUIRED_EVIDENCE_UNAVAILABLE',
      reasons: expect.arrayContaining(['news_not_admitted']),
    });
    expect(await prisma.aiRun.count()).toBe(0);
    expect(harness.dispatch.dispatch).not.toHaveBeenCalled();
  });
  it('来源提示注入只进入证据内容，不能扩大冻结范围或请求权限', async () => {
    harness.data.setMode('untrusted_source_text');
    const response = await harness.post({ ...input, templateId: 'counter-evidence' });
    expect(response.status).toBe(200);
    const result = researchSubmissionReceiptV2Schema.parse(await response.json());
    const run = await prisma.aiRun.findUniqueOrThrow({ where: { id: result.runId } });
    const frozen = verifyAiFrozenResearchV2(
      (run.modelMetadata as Record<string, unknown>).frozenResearch,
    );
    expect(frozen.request.scope).toEqual(input.scope);
    expect(frozen.evidence.every((entry) => ['quote', 'news'].includes(entry.audit.kind))).toBe(
      true,
    );
    expect(harness.models.requests).toHaveLength(0);
  });
  it('关闭 V2 写入或未配置默认模型时，在材料请求前终止', async () => {
    vi.stubEnv('AI_RESEARCH_V2_WRITES_ENABLED', 'false');
    expect((await harness.post(input)).status).toBe(400);
    vi.stubEnv('AI_RESEARCH_V2_WRITES_ENABLED', 'true');
    await prisma.aiRoutingSettings.deleteMany();
    expect((await harness.post(input)).status).toBe(400);
    expect(harness.data.calls).toHaveLength(0);
    expect(await prisma.aiRun.count()).toBe(0);
  });
  it('准备超时中止实际行情请求，不能留下模型任务', async () => {
    vi.stubEnv('AI_RESEARCH_PREPARATION_TIMEOUT_MS', '100');
    harness.data.setMode('hold-quote');
    const response = await harness.post(input);
    expect(response.status).toBe(408);
    await vi.waitFor(() => expect(harness.data.aborted()).toBe(1), { interval: 5 });
    expect(await prisma.aiRun.count()).toBe(0);
    expect(harness.dispatch.dispatch).not.toHaveBeenCalled();
    harness.data.release();
  });
  it('冻结后的实际模型输入超过预算时不创建任务或预扣费用', async () => {
    vi.stubEnv('AI_RESEARCH_POLICY_JSON', JSON.stringify({ maxInputTokens: 1 }));
    const response = await harness.post(input);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: 'RESEARCH_INPUT_BUDGET_EXCEEDED' });
    expect(await prisma.aiRun.count()).toBe(0);
    expect(harness.dispatch.dispatch).not.toHaveBeenCalled();
    expect(harness.models.requests).toHaveLength(0);
  });
  it('HTTP 准备期间断连中止数据请求，晚到数据不触发提交', async () => {
    harness.data.setMode('hold-quote');
    const controller = new AbortController();
    const pending = harness.post(input, '', controller.signal);
    await harness.data.quoteStarted();
    controller.abort();
    await expect(pending).rejects.toThrow();
    await vi.waitFor(() => expect(harness.data.aborted()).toBe(1), { interval: 5 });
    harness.data.release();
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(await prisma.aiRun.count()).toBe(0);
    expect(harness.dispatch.dispatch).not.toHaveBeenCalled();
  });
});
