import { describe, expect, it, vi } from 'vitest';
import { AiRunService } from '../../src/ai/ai-run.service.js';

describe('研究创建固定账户模式', () => {
  it('跨模式账户在创建任务前被拒绝，原任务与账户均不写入', async () => {
    const create = vi.fn();
    const findUnique = vi.fn(async () => ({ id: 'account', active: true, mode: 'actual' }));
    const service = new AiRunService({ account: { findUnique }, aiRun: { create } } as never);
    await expect(
      service.startResearch({
        question: '模式',
        context: { scope: 'account', accountId: 'account', mode: 'shadow' },
      }),
    ).rejects.toThrow('账户模式不一致');
    expect(create).not.toHaveBeenCalled();
  });
  it('保存显式模式，旧 context 仍保持原内容', async () => {
    const create = vi.fn(async ({ data }: { data: unknown }) => data);
    const service = new AiRunService({ aiRun: { create } } as never);
    await expect(
      service.startResearch({ question: '模拟', context: { scope: 'portfolio', mode: 'shadow' } }),
    ).resolves.toMatchObject({ context: { scope: 'portfolio', mode: 'shadow' } });
    await expect(
      service.startResearch({ question: '历史', context: { scope: 'portfolio' } }),
    ).resolves.toMatchObject({ context: { scope: 'portfolio' } });
    expect((create.mock.calls[1]![0].data as { context: object }).context).toEqual({
      scope: 'portfolio',
    });
  });
});
