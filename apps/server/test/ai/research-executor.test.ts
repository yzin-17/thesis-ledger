import { describe, expect, it, vi } from 'vitest';
import { AiResearchExecutor } from '../../src/ai/ai-research.executor.js';
import { AiProviderRegistry } from '../../src/ai/provider-registry.js';
import { FixtureAiProvider } from '../../src/ai/provider-adapters.js';
import { PromptVersionRegistry } from '../../src/ai/prompt-registry.js';

const runId = '11111111-1111-4111-8111-111111111111';

const promptRegistry = () => {
  const prompts = new PromptVersionRegistry();
  prompts.register({
    name: 'research',
    version: 'research-v1',
    template: '只输出 ResearchResult V1 JSON。',
    changedAt: '2026-08-26T00:00:00.000Z',
  });
  return prompts;
};

const prismaFixture = () => ({
  account: {
    findMany: vi.fn(async () => [
      { id: 'account-1', name: '主账户', mode: 'actual', currency: 'CNY' },
    ]),
  },
  position: {
    findMany: vi.fn(async () => [
      {
        id: 'position-1',
        accountId: 'account-1',
        symbol: '600519.SH',
        quantity: 10,
        costPrice: 100,
        source: 'test',
        updatedAt: new Date('2026-08-26T00:00:00.000Z'),
      },
    ]),
  },
  riskEvent: { findMany: vi.fn(async () => []) },
  journalEntry: { findMany: vi.fn(async () => []) },
  strategyVersion: {
    findUnique: vi.fn(async () => ({
      id: '61111111-1111-4111-8111-111111111111',
      strategyId: 'strategy-1',
      version: 3,
      schemaVersion: 1,
      schema: { universe: { symbols: ['600519.SH'] } },
      createdAt: new Date('2026-08-26T00:00:00.000Z'),
      strategy: { name: '质量策略', description: null, status: 'active' },
    })),
  },
});

const toolCallIds = new Map([
  ['getPortfolio', '21111111-1111-4111-8111-111111111111'],
  ['getPositions', '31111111-1111-4111-8111-111111111111'],
  ['getRisk', '41111111-1111-4111-8111-111111111111'],
  ['getJournal', '51111111-1111-4111-8111-111111111111'],
  ['getStrategyVersion', '71111111-1111-4111-8111-111111111111'],
]);

const runRecorder = (context: object = { scope: 'portfolio' }) => {
  const finishResearch = vi.fn(async (id: string, result: unknown) => {
    void id;
    void result;
    return undefined;
  });
  return {
    finishResearch,
    runs: {
      claim: vi.fn(async () => ({
        id: runId,
        provider: 'pending',
        model: 'pending',
        promptVersion: 'research-v1',
        status: 'running',
        question: '当前组合的主要风险是什么？',
        context,
      })),
      renewLease: vi.fn(async () => ({ count: 1 })),
      recordToolCall: vi.fn(async (input: { tool: string }) => ({
        id: toolCallIds.get(input.tool),
      })),
      finishResearch,
      fail: vi.fn(async () => undefined),
    },
  };
};

describe('AI 研究执行器', () => {
  it('领取队列任务，执行只读 Tool，并把证据关联到实际 Tool call', async () => {
    const { runs, finishResearch } = runRecorder();
    const providers = new AiProviderRegistry();
    providers.register(new FixtureAiProvider());
    const executor = new AiResearchExecutor(
      runs as never,
      prismaFixture() as never,
      providers,
      promptRegistry(),
    );

    executor.dispatch(runId);
    await vi.waitFor(() => expect(finishResearch).toHaveBeenCalledOnce());

    const result = finishResearch.mock.calls[0]?.[1] as {
      evidence: Array<{ citations: Array<{ toolCallId?: string }> }>;
    };
    expect(result.evidence.length).toBeGreaterThan(0);
    expect(
      result.evidence.flatMap((item) => item.citations).every((citation) => citation.toolCallId),
    ).toBe(true);
    expect(runs.fail).not.toHaveBeenCalled();
  });

  it('把实际 Tool 返回的数据放进 Provider 研究上下文', async () => {
    const { runs, finishResearch } = runRecorder();
    let providerRequest: {
      evidence?: unknown[];
      context?: unknown;
      toolResults?: Array<{ tool?: string; data?: unknown }>;
    } = {};
    const providers = new AiProviderRegistry();
    providers.register({
      id: 'capture',
      models: ['capture-model'],
      metadata: { health: 'healthy' },
      complete: vi.fn(async (input: { messages: unknown[] }) => {
        const user = input.messages.find(
          (message) =>
            message &&
            typeof message === 'object' &&
            !Array.isArray(message) &&
            (message as { role?: unknown }).role === 'user',
        ) as { content?: string } | undefined;
        const marker = 'RESEARCH_REQUEST_JSON:';
        providerRequest = JSON.parse(user?.content?.split(marker)[1] ?? '{}') as typeof providerRequest;
        return {
          content: {
            version: 1,
            provider: 'capture',
            conclusion: '基于持仓事实完成研究。',
            evidence: providerRequest.evidence ?? [],
            risks: [],
            unknowns: [],
            signals: [],
            disclaimer: 'test',
            context: providerRequest.context,
            createdAt: '2026-08-26T00:00:00.000Z',
          },
          inputTokens: 1,
          outputTokens: 1,
          cost: 0,
        };
      }),
    });
    const executor = new AiResearchExecutor(
      runs as never,
      prismaFixture() as never,
      providers,
      promptRegistry(),
    );

    executor.dispatch(runId);
    await vi.waitFor(() => expect(finishResearch).toHaveBeenCalledOnce());

    const positionsResult = providerRequest.toolResults?.find(
      (result) => result.tool === 'getPositions',
    )?.data as { positions?: Array<{ symbol?: string; quantity?: number; costPrice?: number }> };
    expect(positionsResult.positions).toEqual([
      expect.objectContaining({ symbol: '600519.SH', quantity: 10, costPrice: 100 }),
    ]);
  });

  it('策略研究只读取指定 StrategyVersion，不退化读取全局 Risk/Journal', async () => {
    const strategyVersionId = '61111111-1111-4111-8111-111111111111';
    const { runs, finishResearch } = runRecorder({ scope: 'strategy', strategyVersionId });
    const prisma = prismaFixture();
    const providers = new AiProviderRegistry();
    providers.register(new FixtureAiProvider());
    const executor = new AiResearchExecutor(
      runs as never,
      prisma as never,
      providers,
      promptRegistry(),
    );

    executor.dispatch(runId);
    await vi.waitFor(() => expect(finishResearch).toHaveBeenCalledOnce());

    expect(prisma.strategyVersion.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: strategyVersionId } }),
    );
    expect(prisma.riskEvent.findMany).not.toHaveBeenCalled();
    expect(prisma.journalEntry.findMany).not.toHaveBeenCalled();
  });

  it('没有 Provider 时把任务标记为明确的 provider_unavailable', async () => {
    const fail = vi.fn(async (id: string, code: string) => {
      void id;
      void code;
      return undefined;
    });
    const runs = {
      claim: vi.fn(async () => ({
        id: runId,
        provider: 'pending',
        model: 'pending',
        promptVersion: 'research-v1',
        status: 'running',
        question: '风险？',
        context: { scope: 'portfolio' },
      })),
      renewLease: vi.fn(async () => ({ count: 1 })),
      fail,
    };
    const executor = new AiResearchExecutor(
      runs as never,
      prismaFixture() as never,
      new AiProviderRegistry(),
      promptRegistry(),
    );

    executor.dispatch(runId);
    await vi.waitFor(() => expect(fail).toHaveBeenCalledOnce());
    expect(fail.mock.calls[0]?.[1]).toBe('provider_unavailable');
  });

  it('能力预检区分演示和异常 Provider，并给出可执行影响', () => {
    const providers = new AiProviderRegistry();
    providers.register({
      id: 'down-provider',
      models: ['m1'],
      metadata: { health: 'down' },
      complete: vi.fn(),
    });
    const executor = new AiResearchExecutor(
      {} as never,
      prismaFixture() as never,
      providers,
      promptRegistry(),
    );
    const capabilities = executor.capabilities();
    expect(capabilities.canStart).toBe(false);
    expect(capabilities.providers[0]).toMatchObject({ state: 'error', provider: 'down-provider' });
    expect(capabilities.providers[0]?.impact[0]).toContain('健康检查失败');
  });
});
