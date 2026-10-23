import { PrismaClient } from '@prisma/client';
import { researchSubmissionReceiptV2Schema } from '@thesis-ledger/schemas';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { assertIsolated, databaseUrl } from '../ai/ai-provider-postgres.fixture.js';
import { verifyAiFrozenResearchV2 } from '../../src/ai/ai-research-frozen-integrity-v2.js';
import { createResearchSubmissionPostgresHarness } from './research-submission-postgres.fixture.js';
import { researchFixtureNow } from './research-data-http.fixture.js';

describe.skipIf(!databaseUrl)('基金研究准备：真实数据库资格与受控净值 HTTP', () => {
  let prisma: PrismaClient;
  let harness: Awaited<ReturnType<typeof createResearchSubmissionPostgresHarness>>;
  let input: ReturnType<typeof harness.input>;
  const instrumentId = '00000000-0000-4000-8000-000000000002';
  const symbol = '005827.OF';
  async function metadata(currency = 'CNY') {
    await prisma.asset.create({
      data: {
        symbol,
        name: '受控场外基金',
        market: 'OF',
        assetType: 'fund',
        currency,
        identityStatus: 'confirmed',
      },
    });
    await prisma.instrumentAssetAssociation.create({
      data: {
        instrumentId,
        symbol,
        source: 'controlled-confirmation',
        confirmedAt: new Date('2026-10-18T00:00:00Z'),
      },
    });
  }
  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(researchFixtureNow));
    prisma = new PrismaClient({ datasourceUrl: databaseUrl ?? '' });
    await assertIsolated(prisma);
    harness = await createResearchSubmissionPostgresHarness(prisma);
    await prisma.instrument.create({
      data: {
        id: instrumentId,
        market: 'OF',
        instrumentType: 'MUTUAL_FUND',
        canonicalCode: '005827',
        displayName: '受控场外基金',
        generation: 1,
      },
    });
  });
  beforeEach(async () => {
    await prisma.aiToolCall.deleteMany();
    await prisma.aiRun.deleteMany();
    await prisma.aiRoutingSettings.deleteMany();
    await prisma.instrumentAssetAssociation.deleteMany({ where: { symbol } });
    await prisma.asset.deleteMany({ where: { symbol } });
    vi.stubEnv('STRATEGY_IDENTITY_MODE', undefined);
    vi.stubEnv('AI_RESEARCH_V2_WRITES_ENABLED', 'true');
    vi.stubEnv('AI_RESEARCH_PREPARATION_TIMEOUT_MS', '30000');
    vi.stubEnv('AI_RESEARCH_POLICY_JSON', undefined);
    harness.data.setMode('available');
    harness.redis.clear();
    harness.dispatch.dispatch.mockClear();
    input = harness.input((await harness.models.configureDefault()).revision);
    input.scope.instrumentId = instrumentId;
  });
  afterAll(async () => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
    if (harness) {
      await harness.close();
      await prisma.aiToolCall.deleteMany();
      await prisma.aiRun.deleteMany();
      await prisma.instrumentAssetAssociation.deleteMany({ where: { symbol } });
      await prisma.asset.deleteMany({ where: { symbol } });
      await prisma.instrument.deleteMany({ where: { id: instrumentId } });
    }
    await prisma?.$disconnect();
  });

  it('已确认 CNY 净值可冻结；保留净值日期与未知发布时间，不创建持仓或历史点', async () => {
    await metadata();
    const before = await prisma.asset.findUniqueOrThrow({ where: { symbol } });
    const receipt = researchSubmissionReceiptV2Schema.parse(
      await (await harness.post(input)).json(),
    );
    const run = await prisma.aiRun.findUniqueOrThrow({ where: { id: receipt.runId } });
    const frozen = verifyAiFrozenResearchV2(
      (run.modelMetadata as Record<string, unknown>).frozenResearch,
    );
    expect(frozen.scopeSnapshot).toMatchObject({
      scope: 'instrument',
      instrument: { instrumentId, symbol, assetType: 'MUTUAL_FUND', currency: 'CNY' },
    });
    expect(frozen.evidence[0]).toMatchObject({
      usable: true,
      status: 'partial',
      audit: { contractVersion: 'market-fund-nav-v3', publishedAt: null, availableAt: null },
      data: {
        price: 1.2345,
        valuationDate: '2026-10-18T00:00:00Z',
        currencySource: 'confirmed-asset',
      },
      numericFields: [{ fieldPath: '/price', unit: 'unit-nav', currency: 'CNY' }],
    });
    expect(harness.data.calls.some((call) => call.path.includes('/fund-nav?'))).toBe(true);
    expect(harness.data.calls.some((call) => call.path.includes('/quote?'))).toBe(false);
    expect(await prisma.position.count({ where: { symbol } })).toBe(0);
    expect(await prisma.fundNavPoint.count({ where: { symbol } })).toBe(0);
    expect(await prisma.asset.findUniqueOrThrow({ where: { symbol } })).toEqual(before);
    expect(harness.models.requests).toHaveLength(0);
    expect(harness.dispatch.dispatch).toHaveBeenCalledOnce();
  });
  it('未确认币种不从基金市场默认猜测，也不请求净值', async () => {
    const response = await harness.post(input);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      reasons: expect.arrayContaining(['fund_currency_unverified']),
    });
    expect(harness.data.calls.some((call) => call.path.includes('/fund-nav?'))).toBe(false);
    expect(await prisma.asset.count({ where: { symbol } })).toBe(0);
    expect(await prisma.aiRun.count()).toBe(0);
  });
  it.each(['provider', 'pending'])('元数据或关联尚未确认时拒绝资格：%s', async (kind) => {
    await metadata();
    if (kind === 'provider')
      await prisma.asset.update({ where: { symbol }, data: { identityStatus: 'provider' } });
    else
      await prisma.instrumentAssetAssociation.update({
        where: { symbol },
        data: { confirmedAt: null },
      });
    const response = await harness.post(input);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      reasons: expect.arrayContaining(['fund_currency_unverified']),
    });
    expect(harness.data.calls.some((call) => call.path.includes('/fund-nav?'))).toBe(false);
  });
  it('已知其他币种不消费原协议中无币种的 CNY 净值', async () => {
    await metadata('USD');
    const response = await harness.post(input);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      reasons: expect.arrayContaining(['fund_currency_unsupported']),
    });
    expect(harness.data.calls.some((call) => call.path.includes('/fund-nav?'))).toBe(false);
    expect(await prisma.aiRun.count()).toBe(0);
  });
  it('净值读取期间资格变化，不能用读前币种创建任务', async () => {
    await metadata();
    harness.data.setMode('hold-nav');
    const pending = harness.post(input);
    await harness.data.navStarted();
    await prisma.asset.update({ where: { symbol }, data: { currency: 'USD' } });
    harness.data.release();
    const response = await pending;
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      reasons: expect.arrayContaining(['fund_currency_changed']),
    });
    expect(await prisma.aiRun.count()).toBe(0);
  });
  it.each(['nav-stale', 'nav-future'] as const)('不合格净值不计入必需材料：%s', async (mode) => {
    await metadata();
    harness.data.setMode(mode);
    expect((await harness.post(input)).status).toBe(400);
    expect(await prisma.aiRun.count()).toBe(0);
    expect(harness.dispatch.dispatch).not.toHaveBeenCalled();
  });
  it('超时中止实际净值 HTTP；不留下任务或费用请求', async () => {
    await metadata();
    vi.stubEnv('AI_RESEARCH_PREPARATION_TIMEOUT_MS', '100');
    harness.data.setMode('hold-nav');
    expect((await harness.post(input)).status).toBe(408);
    await vi.waitFor(() => expect(harness.data.aborted()).toBe(1), { interval: 5 });
    expect(await prisma.aiRun.count()).toBe(0);
    expect(harness.models.requests).toHaveLength(0);
  });
  it('客户端断连中止实际净值 HTTP，晚到结果不能创建任务', async () => {
    await metadata();
    harness.data.setMode('hold-nav');
    const abort = new AbortController();
    const pending = harness.post(input, '', abort.signal);
    await harness.data.navStarted();
    abort.abort();
    await expect(pending).rejects.toThrow();
    await vi.waitFor(() => expect(harness.data.aborted()).toBe(1), { interval: 5 });
    harness.data.release();
    expect(await prisma.aiRun.count()).toBe(0);
    expect(harness.dispatch.dispatch).not.toHaveBeenCalled();
  });
});
