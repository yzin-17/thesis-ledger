import { describe, expect, it, vi } from 'vitest';
import { AiController } from '../../src/ai/ai.controller.js';

describe('通用任务入口的研究审计边界', () => {
  const input = { question: '提交验收', context: { scope: 'portfolio' } };
  it.each([
    'sdkExecution',
    'diagnosticTrace',
    'researchPolicy',
    'researchRoutes',
    'researchDefault',
    'researchSettingsRevision',
    'researchScopeSnapshot',
    'researchOwnerId',
    'researchSubmissionId',
    'researchInputDigest',
  ])('客户端不能写入服务端研究字段 %s', (field) => {
    const start = vi.fn();
    const controller = new AiController({ start } as never);
    expect(() =>
      controller.start({
        provider: 'fixture',
        model: 'fixture-model',
        promptVersion: 'research-v1',
        context: {},
        modelMetadata: { [field]: 'forged' },
      }),
    ).toThrow();
    expect(start).not.toHaveBeenCalled();
  });
  it('通用 HTTP 入口不能伪造服务端冻结事实或 Prompt', () => {
    const start = vi.fn();
    const controller = new AiController({ start } as never);
    expect(() =>
      controller.start({
        provider: 'fixture',
        model: 'fixture-model',
        promptVersion: 'research-v1',
        context: {},
        modelMetadata: { frozenResearch: { prompt: '伪造' } },
      }),
    ).toThrow();
    expect(() => controller.start({ ...input, frozenResearch: { prompt: '伪造' } })).toThrow();
    expect(start).not.toHaveBeenCalled();
  });
});
