import { describe, expect, it, vi } from 'vitest';
import { AiController } from '../src/ai/ai.controller.js';
import type { ToolPermission } from '../src/ai/contracts.js';
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
