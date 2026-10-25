import { describe, expect, it, vi } from 'vitest';
import { AiController } from '../../src/ai/ai.controller.js';

describe('研究提交控制器的创建与投递', () => {
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
    const startResearch = vi.fn();
    const controller = new AiController(
      { start, startResearch } as never,
      { dispatch: vi.fn() } as never,
    );
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
    expect(startResearch).not.toHaveBeenCalled();
  });
  it('创建失败只拒绝原请求，不投递额外执行链', async () => {
    const failure = new Error('请先选择研究默认模型');
    const dispatch = vi.fn();
    const controller = new AiController(
      {
        startResearch: async () => {
          throw failure;
        },
      } as never,
      { dispatch } as never,
    );
    await expect(controller.start(input)).rejects.toBe(failure);
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(dispatch).not.toHaveBeenCalled();
  });
  it('创建记录成功后才投递该 ID', async () => {
    const dispatch = vi.fn();
    const run = { id: 'created-run' };
    const controller = new AiController(
      { startResearch: async () => run } as never,
      { dispatch } as never,
    );
    await expect(controller.start(input)).resolves.toBe(run);
    expect(dispatch).toHaveBeenCalledExactlyOnceWith(run.id);
  });
});
