import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  aiFrozenResearchV2Schema,
  type Quote,
  type ResearchScopeSnapshotV2,
} from '@thesis-ledger/schemas';
import { ResearchSubmissionService } from '../../src/research/research-submission.service.js';
import { PromptVersionRegistry } from '../../src/ai/prompt-registry.js';
import { researchPromptsV2 } from '../../src/ai/ai-research-prompts-v2.js';
import { verifyAiFrozenResearchV2 } from '../../src/ai/ai-research-frozen-integrity-v2.js';
import { submissionV2Fixture } from '../ai/research-submission-v2.fixture.js';
import { createAiTraceReference } from '../../src/ai/trace/ai-trace-contract.js';
import { currentAiTraceReference } from '../../src/ai/trace/ai-trace-context.js';

function fixture() {
  const { input, frozen } = submissionV2Fixture();
  input.templateId = 'primary-risks';
  const scope = frozen.scopeSnapshot;
  const prompts = new PromptVersionRegistry();
  for (const prompt of researchPromptsV2) prompts.register(prompt);
  const owner = randomUUID();
  const run = {
    id: randomUUID(),
    researchSubmissionId: input.submissionId,
    status: 'queued',
    researchScopeSnapshot: scope,
  };
  const runs = {
    findResearchSubmissionV2: vi.fn<() => Promise<unknown>>().mockResolvedValue(null),
    researchV2Default: vi.fn().mockResolvedValue({}),
    startResearchV2: vi.fn().mockResolvedValue({ run, reused: false }),
    cancelResearchSubmissionV2: vi.fn().mockResolvedValue({ ...run, status: 'cancelled' }),
  };
  const executor = { dispatch: vi.fn(), cancelActive: vi.fn() };
  const scopes = { resolve: vi.fn().mockResolvedValue({ scopeSnapshot: scope, privateMaterial: null, fetchedAt: scope.confirmedAt, reasons: [] }) };
  const quote: Quote = {
    version: 3,
    symbol: '600519.SH',
    open: 100,
    high: 100,
    low: 100,
    price: 100,
    previousClose: 100,
    volume: null,
    amount: null,
    provider: 'controlled-price',
    upstreamSource: 'controlled-price',
    fetchedAt: new Date(Date.now() - 1_000).toISOString(),
    marketTime: new Date(Date.now() - 2_000).toISOString(),
    stale: false,
    freshness: 'live',
    units: { priceCurrency: 'CNY', volume: 'unknown', turnoverCurrency: 'unknown' },
  };
  const market = { getQuote: vi.fn().mockResolvedValue(quote) };
  const news = {
    read: vi
      .fn()
      .mockResolvedValue({
        items: [],
        source: null,
        status: 'unavailable',
        errors: [{ code: 'not_admitted' }],
        coverage: { missingReasons: ['not_admitted'] },
      }),
  };
  const service = new ResearchSubmissionService(
    runs as never,
    executor as never,
    prompts,
    scopes as never,
    market as never,
    news as never,
  );
  return { input, owner, run, runs, executor, scopes, quote, market, news, service };
}
afterEach(() => vi.unstubAllEnvs());

describe('研究准备到提交的有界行为', () => {
  it('可选 trace 引用穿过异步材料准备，只影响本次创建上下文', async () => {
    const f = fixture();
    const reference = createAiTraceReference();
    let seen: unknown;
    f.runs.startResearchV2.mockImplementation(() => {
      seen = currentAiTraceReference();
      return Promise.resolve({ run: f.run, reused: false });
    });
    await f.service.submit(f.owner, f.input, undefined, reference);
    expect(seen).toEqual(reference);
    expect(currentAiTraceReference()).toBeUndefined();
  });
  it('默认模型未就绪时不获取材料或投递执行', async () => {
    const f = fixture();
    f.runs.researchV2Default.mockRejectedValue(new Error('默认模型未就绪'));
    await expect(f.service.submit(f.owner, f.input)).rejects.toThrow('默认模型未就绪');
    expect(f.market.getQuote).not.toHaveBeenCalled();
    expect(f.news.read).not.toHaveBeenCalled();
    expect(f.runs.startResearchV2).not.toHaveBeenCalled();
  });
  it('部分材料冻结真实数据和未知修订，准备完成后只投递已创建任务', async () => {
    const f = fixture();
    const result = await f.service.submit(f.owner, f.input);
    expect(result).toMatchObject({
      runId: f.run.id,
      reused: false,
      scopeSnapshot: f.run.researchScopeSnapshot,
    });
    expect(f.executor.dispatch).toHaveBeenCalledExactlyOnceWith(f.run.id);
    const frozen = verifyAiFrozenResearchV2(f.runs.startResearchV2.mock.calls[0]![1]);
    expect(frozen).toMatchObject({
      quality: { status: 'partial' },
      prompt: { version: 'research-v2-primary-risks' },
    });
    expect(frozen.evidence[0]!.audit).toMatchObject({
      policyRevision: null,
      routeRevision: null,
      credentialRevision: null,
      fetchedAt: f.quote.fetchedAt,
    });
    expect(f.market.getQuote.mock.calls[0]![1]).toMatchObject({
      allowStale: false,
      assetType: 'STOCK',
      signal: expect.any(AbortSignal),
    });
    const request = f.news.read.mock.calls[0]![0] as Record<string, unknown>;
    expect(Object.keys(request).sort()).toEqual([
      'cursor',
      'instrument',
      'limit',
      'publishedEnd',
      'publishedStart',
      'requestBudgetMs',
    ]);
    expect(request).not.toHaveProperty('question');
  });
  it('需要新闻的模板不会以空搜索或失败材料生成任务', async () => {
    const f = fixture();
    await expect(
      f.service.submit(f.owner, { ...f.input, templateId: 'counter-evidence' }),
    ).rejects.toMatchObject({ response: { code: 'RESEARCH_REQUIRED_EVIDENCE_UNAVAILABLE' } });
    expect(f.runs.startResearchV2).not.toHaveBeenCalled();
    expect(f.executor.dispatch).not.toHaveBeenCalled();
  });
  it('冻结范围使用实际报价的已知币种，不把目录市场的默认值当成已核验币种', async () => {
    const f = fixture();
    f.quote.units!.priceCurrency = 'USD';
    await f.service.submit(f.owner, f.input);
    const frozen = verifyAiFrozenResearchV2(f.runs.startResearchV2.mock.calls[0]![1]);
    if (frozen.scopeSnapshot.scope !== 'instrument') throw new Error('公开范围缺失');
    expect(frozen.scopeSnapshot.instrument.currency).toBe('USD');
    expect(frozen.evidence[0]!.data).toMatchObject({ price: 100, currency: 'USD' });
  });
  it('找回原提交不重新取数、重新冻结或投递，写入开关关闭也不改变原范围', async () => {
    const f = fixture();
    vi.stubEnv('AI_RESEARCH_V2_WRITES_ENABLED', 'false');
    f.runs.findResearchSubmissionV2.mockResolvedValue(f.run);
    expect(await f.service.submit(f.owner, f.input)).toMatchObject({
      runId: f.run.id,
      reused: true,
    });
    expect(f.scopes.resolve).not.toHaveBeenCalled();
    expect(f.runs.researchV2Default).not.toHaveBeenCalled();
    expect(f.news.read).not.toHaveBeenCalled();
    expect(f.executor.dispatch).not.toHaveBeenCalled();
  });
  it.each(['currency', 'stale', 'future'] as const)('拒绝不能合格引用的报价 %s', async (kind) => {
    const f = fixture();
    const quote = structuredClone(f.quote);
    if (kind === 'currency') delete quote.units;
    else if (kind === 'stale') quote.stale = true;
    else quote.fetchedAt = new Date(Date.now() + 60_000).toISOString();
    f.market.getQuote.mockResolvedValue(quote);
    await expect(f.service.submit(f.owner, f.input)).rejects.toMatchObject({
      response: { code: 'RESEARCH_REQUIRED_EVIDENCE_UNAVAILABLE' },
    });
    expect(f.runs.startResearchV2).not.toHaveBeenCalled();
  });
  it('准备超时后返回明确期限错误，不创建或投递模型任务', async () => {
    const f = fixture();
    vi.stubEnv('AI_RESEARCH_PREPARATION_TIMEOUT_MS', '15');
    f.market.getQuote.mockImplementation(() => new Promise(() => {}));
    await expect(f.service.submit(f.owner, f.input)).rejects.toMatchObject({
      status: 408,
      response: { code: 'RESEARCH_PREPARATION_TIMEOUT' },
    });
    expect(f.runs.startResearchV2).not.toHaveBeenCalled();
    expect(f.executor.dispatch).not.toHaveBeenCalled();
  });
  it('准备期间取消，晚到材料不会创建任务', async () => {
    const f = fixture();
    const controller = new AbortController();
    let release!: (value: Quote) => void;
    f.market.getQuote.mockImplementation(
      () =>
        new Promise<Quote>((resolve) => {
          release = resolve;
        }),
    );
    const pending = f.service.submit(f.owner, f.input, controller.signal);
    await vi.waitFor(() => expect(f.market.getQuote).toHaveBeenCalled(), { interval: 1 });
    controller.abort();
    await expect(pending).rejects.toMatchObject({
      response: { code: 'RESEARCH_PREPARATION_CANCELLED' },
    });
    release(f.quote);
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(f.runs.startResearchV2).not.toHaveBeenCalled();
  });
  it('客户端伪造服务端字段在准备前拒绝', async () => {
    const f = fixture();
    await expect(
      f.service.submit(f.owner, { ...f.input, ownerId: randomUUID(), scopeSnapshot: {} }),
    ).rejects.toThrow();
    expect(f.scopes.resolve).not.toHaveBeenCalled();
    expect(f.market.getQuote).not.toHaveBeenCalled();
  });
  it('服务端冻结后的材料和范围可重新验证，不受之后响应对象变化影响', async () => {
    const f = fixture();
    await f.service.submit(f.owner, f.input);
    const saved = aiFrozenResearchV2Schema.parse(f.runs.startResearchV2.mock.calls[0]![1]);
    f.quote.price = 999;
    (
      f.run.researchScopeSnapshot as Extract<ResearchScopeSnapshotV2, { scope: 'instrument' }>
    ).instrument.catalogGeneration += 1;
    expect(verifyAiFrozenResearchV2(saved).evidence[0]!.data).toMatchObject({ price: 100 });
    expect(saved.scopeSnapshot).not.toEqual(f.run.researchScopeSnapshot);
  });
});
