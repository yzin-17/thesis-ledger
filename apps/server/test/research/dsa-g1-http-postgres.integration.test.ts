import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import {
  aiExecutionSummarySchema,
  researchGenerationV2Schema,
  researchReportDetailSchema,
  researchReportPageSchema,
  researchResultV2Schema,
  researchSubmissionReceiptV2Schema,
} from '@thesis-ledger/schemas';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { DsaClient } from '../../src/integration/dsa/dsa.client.js';
import { MarketQuoteReader } from '../../src/market/market-quote-reader.js';
import { verifyAiFrozenResearchV2 } from '../../src/ai/ai-research-frozen-integrity-v2.js';
import { assertIsolated, databaseUrl } from '../ai/ai-provider-postgres.fixture.js';
import { createResearchDsaProcessFixture } from './research-dsa-process.fixture.js';
import {
  controlledRedis,
  createResearchSubmissionPostgresHarness,
} from './research-submission-postgres.fixture.js';

let producer: Awaited<ReturnType<typeof createResearchDsaProcessFixture>>;
const enabled = process.env.RESEARCH_DSA_INTEGRATION_TEST === '1';
beforeAll(async () => {
  if (enabled) producer = await createResearchDsaProcessFixture();
}, 20_000);
afterAll(async () => {
  await producer?.close();
}, 20_000);

it.skipIf(!enabled)(
  'G1 低层预检：实际 DSA 报价与新闻由主仓客户端读取，不使用固定 API 成功响应',
  async () => {
    await producer.setMode('available');
    const client = Object.assign(Object.create(DsaClient.prototype), {
      config: {
        dsaBaseUrl: producer.baseUrl,
        dsaTimeoutMs: 5_000,
        dsaToken: 'controlled-data-token',
      },
    }) as DsaClient;
    const quote = await client.get<Record<string, unknown>>(
      '/api/v3/thesis-ledger/market/quote?symbol=510300.SH',
    );
    expect(quote).toMatchObject({
      version: 3,
      symbol: '510300.SH',
      price: 100,
      provider: 'tencent',
      volume: null,
    });
    expect(quote.stale, JSON.stringify(quote)).toBe(false);
    expect(quote.units, JSON.stringify(quote)).toMatchObject({
      priceCurrency: 'CNY',
      volume: 'unknown',
      turnoverCurrency: 'unknown',
    });
    expect(['live', 'delayed'], JSON.stringify(quote)).toContain(quote.freshness);
    expect(Date.parse(String(quote.marketTime)), JSON.stringify(quote)).toBeLessThanOrEqual(
      Date.now(),
    );
    await producer.setMode('available');
    const marketQuote = await new MarketQuoteReader(client, controlledRedis() as never).getQuote(
      '510300.SH',
      { assetType: 'ETF' },
    );
    expect(marketQuote.stale, JSON.stringify(marketQuote)).toBe(false);
    expect(['live', 'delayed'], JSON.stringify(marketQuote)).toContain(marketQuote.freshness);
    expect(marketQuote.units?.priceCurrency, JSON.stringify(marketQuote)).toBe('CNY');
    const news = await client.marketNewsV3({
      version: 3,
      capability: 'NEWS_SEARCH',
      contractVersion: 'news-search-v1',
      requestId: randomUUID(),
      instrument: { market: 'CN', assetType: 'ETF', symbol: '510300.SH' },
      publishedStart: null,
      publishedEnd: null,
      limit: 10,
      cursor: null,
      requestBudgetMs: 5_000,
    });
    expect(news).toMatchObject({
      status: 'available',
      upstreamAttempts: 1,
      route: { providerId: 'searxng' },
    });
    expect(news.items[0]?.title).toBe('沪深300ETF 受控公开资料');
    expect(producer.rawCalls.some((path) => path.startsWith('/tencent/'))).toBe(true);
    expect(producer.rawCalls.some((path) => path.startsWith('/search-source/search'))).toBe(true);
  },
  15_000,
);

function boundGeneration(
  frozen: ReturnType<typeof verifyAiFrozenResearchV2>,
  instrumentId: string,
) {
  const sample = JSON.parse(
    readFileSync(
      new URL('../../../../packages/schemas/fixtures/research-v2.samples.json', import.meta.url),
      'utf8',
    ),
  ) as { generation: unknown };
  const generation = researchGenerationV2Schema.parse(sample.generation);
  const price = frozen.evidence.find((item) => item.audit.kind === 'quote' && item.usable);
  if (!price) throw new Error('G1 受控报价未通过实际材料准备');
  for (const claim of generation.claims) {
    claim.evidenceIds = [price.audit.evidenceId];
    if (claim.kind === 'price-direction') claim.instrumentId = instrumentId;
  }
  for (const claim of generation.numericClaims) {
    if (claim.kind === 'field') claim.source.evidenceId = price.audit.evidenceId;
    else for (const operand of claim.operands) operand.evidenceId = price.audit.evidenceId;
  }
  for (const condition of generation.invalidationConditions) {
    condition.evidenceIds = [price.audit.evidenceId];
    if (condition.kind === 'price-threshold') condition.instrumentId = instrumentId;
  }
  for (const step of generation.nextSteps) {
    if (step.evidenceIds.length) step.evidenceIds = [price.audit.evidenceId];
  }
  generation.confidence.basis = ['受控来源与受控模型响应，仅验证联通。'];
  return generation;
}

describe.skipIf(!databaseUrl || !enabled)('G1：实际 Server、DSA、PostgreSQL 与受控 SDK/SSE', () => {
  let prisma: PrismaClient;
  let harness: Awaited<ReturnType<typeof createResearchSubmissionPostgresHarness>>;
  let input: ReturnType<typeof harness.input>;
  let instrumentId: string;
  beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: databaseUrl ?? '' });
    await assertIsolated(prisma);
    harness = await createResearchSubmissionPostgresHarness(prisma, producer, 5_000);
  });
  beforeEach(async () => {
    await prisma.aiToolCall.deleteMany();
    await prisma.aiRun.deleteMany();
    await prisma.aiRoutingSettings.deleteMany();
    const existing = await prisma.instrument.findFirst({
      where: { market: 'SH', instrumentType: 'ETF', canonicalCode: '510300' },
    });
    const fields = {
      market: 'SH' as const,
      instrumentType: 'ETF' as const,
      canonicalCode: '510300',
      displayName: '沪深300ETF',
      active: true,
      generation: 1,
    };
    const instrument = existing
      ? await prisma.instrument.update({ where: { id: existing.id }, data: fields })
      : await prisma.instrument.create({ data: { id: randomUUID(), ...fields } });
    instrumentId = instrument.id;
    vi.stubEnv('STRATEGY_IDENTITY_MODE', undefined);
    vi.stubEnv('AI_RESEARCH_V2_WRITES_ENABLED', 'true');
    vi.stubEnv('AI_RESEARCH_PREPARATION_TIMEOUT_MS', '30000');
    vi.stubEnv('AI_RESEARCH_POLICY_JSON', undefined);
    await producer.setMode('available');
    harness.models.setMode('valid');
    harness.redis.clear();
    harness.dispatch.dispatch.mockClear();
    harness.dispatch.cancelActive.mockReset();
    harness.dispatch.cancelActive.mockImplementation((id: string) =>
      harness.models.cancelActive(id),
    );
    input = {
      ...harness.input((await harness.models.configureDefault()).revision),
      scope: { scope: 'instrument', instrumentId },
      templateId: 'counter-evidence',
    };
  });
  afterAll(async () => {
    if (harness) await harness.close();
    await prisma?.$disconnect();
    vi.unstubAllEnvs();
  }, 20_000);

  const frozenFor = async (id: string) => {
    const row = await prisma.aiRun.findUniqueOrThrow({ where: { id } });
    return verifyAiFrozenResearchV2((row.modelMetadata as Record<string, unknown>).frozenResearch);
  };
  const submit = async () => {
    const response = await harness.post(input);
    expect(response.status, await response.clone().text()).toBe(200);
    return researchSubmissionReceiptV2Schema.parse(await response.json());
  };
  const complete = async (id: string) => {
    harness.models.setGeneration(boundGeneration(await frozenFor(id), instrumentId));
    await harness.models.execute(id);
    const row = await prisma.aiRun.findUniqueOrThrow({ where: { id } });
    expect(row.status, JSON.stringify({ code: row.errorCode, summary: row.errorSummary })).toBe(
      'succeeded',
    );
    return row;
  };

  it('并发同标识只保存/投递/执行一次，冻结实际来源并持久化审计与单次结算', async () => {
    const responses = await Promise.all(Array.from({ length: 3 }, () => harness.post(input)));
    expect(
      responses.map((response) => response.status),
      JSON.stringify(await Promise.all(responses.map((response) => response.clone().text()))),
    ).toEqual([200, 200, 200]);
    const receipts = await Promise.all(
      responses.map(async (response) =>
        researchSubmissionReceiptV2Schema.parse(await response.json()),
      ),
    );
    expect(new Set(receipts.map((receipt) => receipt.runId)).size).toBe(1);
    expect(receipts.filter((receipt) => !receipt.reused)).toHaveLength(1);
    expect(harness.dispatch.dispatch).toHaveBeenCalledOnce();
    const id = receipts[0]!.runId;
    const frozen = await frozenFor(id);
    expect(frozen.evidence.filter((item) => item.usable).map((item) => item.audit.kind)).toEqual([
      'quote',
      'news',
    ]);
    expect(frozen.evidence.find((item) => item.audit.kind === 'news')?.audit).toMatchObject({
      providerId: 'searxng',
      upstreamSource: 'searxng-news-search',
      contractVersion: 'news-search-v1',
      policyRevision: 'effective:1',
    });
    expect(harness.models.requests).toHaveLength(0);
    const row = await complete(id);
    expect(row).toMatchObject({ status: 'succeeded', inputTokens: 8, outputTokens: 5 });
    const result = researchResultV2Schema.parse(row.result);
    expect(result.inputFingerprint).toBe(frozen.inputFingerprint);
    expect(result.evidenceBindings).toHaveLength(2);
    const execution = aiExecutionSummarySchema.parse(
      (row.modelMetadata as Record<string, unknown>).sdkExecution,
    );
    expect(execution.requests).toHaveLength(1);
    expect(execution.requests[0]).toMatchObject({
      state: 'completed',
      settledRevision: 1,
      usageRevisions: [{ cost: { status: 'known', amount: '0.07', currency: 'USD' } }],
    });
    expect(harness.models.requests).toHaveLength(1);
    expect(harness.models.requests[0]).not.toHaveProperty('tools');
    expect(JSON.stringify(harness.models.requests)).toContain('受控来源原文摘录。');
    await harness.models.execute(id);
    expect(harness.models.requests).toHaveLength(1);
    expect(await prisma.aiRun.count()).toBe(1);
    for (const call of producer.calls) {
      expect(call.dataAuthorized).toBe(true);
      expect(JSON.stringify(call.body)).not.toMatch(/accountId|question|submissionId/);
    }
  }, 20_000);

  it('历史/引用只读原冻结产物，来源撤销后仍可读取，模式隔离且不重新取数或生成', async () => {
    const receipt = await submit();
    const row = await complete(receipt.runId);
    const result = researchResultV2Schema.parse(row.result);
    await producer.setMode('not_admitted');
    const query = { view: 'scoped', mode: 'shadow' };
    const page = researchReportPageSchema.parse(
      await (await harness.get('/research/reports', query)).json(),
    );
    expect(page.items.map((item) => item.id)).toEqual([row.id]);
    const detail = researchReportDetailSchema.parse(
      await (await harness.get('/research/reports/' + row.id, query)).json(),
    );
    expect(detail.result).toEqual(result);
    const news = result.evidenceBindings.find((item) => item.audit.kind === 'news')!;
    const evidence = await harness.get(
      `/research/reports/${row.id}/evidence/${news.audit.evidenceId}`,
      query,
    );
    expect(evidence.status).toBe(200);
    expect(JSON.stringify(await evidence.json())).toContain('沪深300ETF 受控公开资料');
    expect(
      (await harness.get('/research/reports/' + row.id, { ...query, mode: 'actual' })).status,
    ).toBe(404);
    expect(producer.calls).toHaveLength(0);
    expect(producer.rawCalls).toHaveLength(0);
    expect(harness.models.requests).toHaveLength(1);
    expect(await prisma.aiRun.findUniqueOrThrow({ where: { id: row.id } })).toEqual(row);
  }, 15_000);

  it('模式无效与必需新闻未准入均不创建任务或发送模型请求', async () => {
    expect((await harness.post({ ...input, mode: 'invalid-mode' })).status).toBe(400);
    expect(producer.calls).toHaveLength(0);
    await producer.setMode('not_admitted');
    const response = await harness.post(input);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      code: 'RESEARCH_REQUIRED_EVIDENCE_UNAVAILABLE',
      reasons: expect.arrayContaining(['news_not_admitted']),
    });
    expect(producer.rawCalls.some((path) => path.startsWith('/search-source/search'))).toBe(false);
    expect(await prisma.aiRun.count()).toBe(0);
    expect(harness.models.requests).toHaveLength(0);
    expect(harness.dispatch.dispatch).not.toHaveBeenCalled();
  }, 15_000);

  it('实际已冻结来源约束数字输出，错误数字仍保留一次真实受控调用和费用事实', async () => {
    const receipt = await submit();
    const generation = boundGeneration(await frozenFor(receipt.runId), instrumentId);
    const numeric = generation.numericClaims.find((item) => item.kind === 'field');
    if (numeric?.kind !== 'field') throw new Error('G1 缺少数字断言');
    numeric.source.value = 999;
    harness.models.setGeneration(generation);
    await harness.models.execute(receipt.runId);
    const row = await prisma.aiRun.findUniqueOrThrow({ where: { id: receipt.runId } });
    expect(row).toMatchObject({ status: 'failed', result: null });
    expect(row.errorSummary).toContain('数值引用与冻结字段实际取值不一致');
    const execution = aiExecutionSummarySchema.parse(
      (row.modelMetadata as Record<string, unknown>).sdkExecution,
    );
    expect(execution.requests).toHaveLength(1);
    expect(execution.requests[0]?.usageRevisions[0]?.cost).toMatchObject({
      status: 'known',
      amount: '0.07',
      currency: 'USD',
    });
    expect(harness.models.requests).toHaveLength(1);
  }, 15_000);

  it('HTTP 取消先持久化，受控 SDK 中断及晚到响应不能改写终态或再次结算', async () => {
    const receipt = await submit();
    harness.models.setMode('hold');
    harness.models.setGeneration(boundGeneration(await frozenFor(receipt.runId), instrumentId));
    const execution = harness.models.execute(receipt.runId);
    await harness.models.received();
    expect((await harness.post(input, '/cancel')).status).toBe(200);
    await execution;
    const cancelled = await prisma.aiRun.findUniqueOrThrow({ where: { id: receipt.runId } });
    expect(cancelled).toMatchObject({ status: 'cancelled', result: null });
    harness.models.release();
    await harness.models.execute(receipt.runId);
    expect(await prisma.aiRun.findUniqueOrThrow({ where: { id: receipt.runId } })).toEqual(
      cancelled,
    );
    expect(harness.models.requests).toHaveLength(1);
  }, 15_000);
});
