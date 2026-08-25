import { describe, expect, it, vi } from 'vitest';
import { AiController } from '../src/ai/ai.controller.js';
import type { ToolPermission } from '../src/ai/contracts.js';
import { AiRunService } from '../src/ai/ai-run.service.js';
import { AiProviderRegistry } from '../src/ai/provider-registry.js';
import { executeAuditedTool, type AiToolCallAuditInput } from '../src/ai/tool-runtime.js';

describe('AI trust boundary', () => {
  it('HTTP controller does not expose client-written finish or tool-call audit endpoints', () => {
    const methods = Object.getOwnPropertyNames(AiController.prototype);
    expect(methods).not.toContain('finish');
    expect(methods).not.toContain('toolCall');
  });

  it('HTTP start preserves non-audit model metadata used by deterministic review flows', () => {
    const runs = { start: vi.fn() };
    const controller = new AiController(runs as never);
    const modelMetadata = {
      mode: 'deterministic-evidence-only',
      evidence: { source: 'journal', cost: 12.5 },
    };

    controller.start({
      provider: 'mock',
      model: 'm1',
      promptVersion: 'v1',
      modelMetadata,
    });

    expect(runs.start).toHaveBeenCalledWith('mock', 'm1', 'v1', undefined, modelMetadata);
  });

  it('研究启动由服务端接收问题和精确上下文，不接受客户端 Provider 审计字段', () => {
    const runs = { startResearch: vi.fn() };
    const controller = new AiController(runs as never);
    controller.start({
      question: '当前组合的主要风险是什么？',
      context: { scope: 'portfolio' },
      templateId: 'primary-risks',
    });
    expect(runs.startResearch).toHaveBeenCalledWith({
      question: '当前组合的主要风险是什么？',
      context: { scope: 'portfolio' },
      templateId: 'primary-risks',
    });
    expect(() =>
      controller.start({
        question: '风险？',
        context: { scope: 'portfolio' },
        modelMetadata: { cost: 1 },
      }),
    ).toThrow();
  });

  it('历史 limit 非数字时回退默认值，不把 NaN 传给 Prisma', () => {
    const runs = { list: vi.fn() };
    const controller = new AiController(runs as never);
    controller.history('not-a-number', 'running');
    expect(runs.list).toHaveBeenCalledWith(undefined, 'running');
  });

  it('历史状态筛选只接受有限任务状态', () => {
    const runs = { list: vi.fn() };
    const controller = new AiController(runs as never);
    expect(() => controller.history('20', 'unknown')).toThrow();
    expect(runs.list).not.toHaveBeenCalled();
  });

  it.each([
    ['inputTokens', 999999],
    ['outputTokens', 999999],
    ['cost', 999999],
    ['durationMs', 999999],
    ['usage', { inputTokens: 1 }],
    ['toolCalls', []],
    ['fallbackErrors', []],
  ] as const)('HTTP start rejects client-written audit metadata field %s', (field, value) => {
    const runs = { start: vi.fn() };
    const controller = new AiController(runs as never);

    expect(() =>
      controller.start({
        provider: 'mock',
        model: 'm1',
        promptVersion: 'v1',
        modelMetadata: { [field]: value },
      }),
    ).toThrow();
    expect(runs.start).not.toHaveBeenCalled();
  });

  it('persists token usage and cost from the actual provider completion', async () => {
    const prisma = {
      aiRun: {
        update: vi.fn(async ({ data }: { data: object }) => data),
      },
      aiToolCall: {
        findMany: vi.fn(async () => [{ id: '21111111-1111-4111-8111-111111111111' }]),
      },
    };
    const runs = new AiRunService(prisma as never);
    const registry = new AiProviderRegistry();
    const complete = vi.fn(async () => ({
      content: {
        version: 1,
        provider: 'trusted-provider',
        conclusion: 'trusted',
        evidence: [
          {
            claim: 'trusted evidence',
            citations: [
              {
                toolCallId: '21111111-1111-4111-8111-111111111111',
                tool: 'fixture',
                sourceId: 'fixture:1',
                provider: 'trusted-provider',
                observedAt: '2026-08-26T00:00:00.000Z',
              },
            ],
          },
        ],
        risks: [],
        unknowns: [],
        disclaimer: '仅供研究参考。',
        createdAt: '2026-08-26T00:00:00.000Z',
      },
      inputTokens: 17,
      outputTokens: 23,
      cost: 0.0042,
    }));
    registry.register({ id: 'trusted-provider', models: ['m1'], complete });

    await runs.completeWithProvider('11111111-1111-4111-8111-111111111111', registry, {
      model: 'm1',
      messages: [{ role: 'user', content: 'question' }],
      tools: [],
      toolCallIds: ['21111111-1111-4111-8111-111111111111'],
    });

    expect(complete).toHaveBeenCalledOnce();
    expect(prisma.aiRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          provider: 'trusted-provider',
          status: 'succeeded',
          inputTokens: 17,
          outputTokens: 23,
          cost: 0.0042,
          durationMs: expect.any(Number),
        }),
      }),
    );
  });

  it('rejects an invalid provider result instead of persisting succeeded', async () => {
    const updates: object[] = [];
    const prisma = {
      aiRun: {
        update: vi.fn(async ({ data }: { data: object }) => {
          updates.push(data);
          return data;
        }),
      },
    };
    const runs = new AiRunService(prisma as never);
    const registry = new AiProviderRegistry();
    registry.register({
      id: 'invalid-provider',
      models: ['m1'],
      complete: vi.fn(async () => ({
        content: { conclusion: 'free form' },
        inputTokens: 1,
        outputTokens: 1,
        cost: 0,
      })),
    });

    await expect(
      runs.completeWithProvider('11111111-1111-4111-8111-111111111111', registry, {
        model: 'm1',
        messages: [],
        tools: [],
      }),
    ).rejects.toThrow();
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({ status: 'failed', errorCode: 'provider_completion_failed' });
  });

  it('derives tool audit duration and provenance from the server execution', async () => {
    const recorder = {
      recordToolCall: vi.fn(async (input: AiToolCallAuditInput) => input),
    };
    const result = await executeAuditedTool(
      recorder,
      '11111111-1111-4111-8111-111111111111',
      {
        name: 'getQuote',
        permission: 'market:read',
        async execute() {
          return {
            provider: 'dsa',
            marketTime: '2026-08-21T06:55:00.000Z',
            price: 100,
          };
        },
      },
      { symbol: '600519.SH' },
      new Set<ToolPermission>(['market:read']),
    );

    expect(result.status).toBe('ok');
    expect(recorder.recordToolCall).toHaveBeenCalledWith(
      expect.objectContaining({
        tool: 'getQuote',
        permission: 'market:read',
        status: 'ok',
        provider: 'dsa',
        marketTime: '2026-08-21T06:55:00.000Z',
        fetchedAt: expect.any(String),
        durationMs: expect.any(Number),
      }),
    );
  });
});
