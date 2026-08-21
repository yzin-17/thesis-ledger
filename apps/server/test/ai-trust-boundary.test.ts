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

  it('HTTP start ignores client supplied model metadata', () => {
    const runs = { start: vi.fn() };
    const controller = new AiController(runs as never);

    controller.start({
      provider: 'mock',
      model: 'm1',
      promptVersion: 'v1',
      modelMetadata: { inputTokens: 999999, cost: 999999 },
    });

    expect(runs.start).toHaveBeenCalledWith('mock', 'm1', 'v1', undefined);
  });

  it('persists token usage and cost from the actual provider completion', async () => {
    const prisma = {
      aiRun: {
        update: vi.fn(async ({ data }: { data: object }) => data),
      },
    };
    const runs = new AiRunService(prisma as never);
    const registry = new AiProviderRegistry();
    const complete = vi.fn(async () => ({
      content: { conclusion: 'trusted' },
      inputTokens: 17,
      outputTokens: 23,
      cost: 0.0042,
    }));
    registry.register({ id: 'trusted-provider', models: ['m1'], complete });

    await runs.completeWithProvider('11111111-1111-4111-8111-111111111111', registry, {
      model: 'm1',
      messages: [{ role: 'user', content: 'question' }],
      tools: [],
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
