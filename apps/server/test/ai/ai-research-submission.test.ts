import { describe, expect, it, vi } from 'vitest';
import { AiRunService } from '../../src/ai/ai-run.service.js';
import { AiResearchSubmission } from '../../src/ai/ai-research-submission.js';
import type { AiFrozenResearch } from '../../src/ai/ai-frozen-research.js';

describe('研究提交的配置事务边界', () => {
  it('冻结来源与 Prompt 在配置事务等待前复制，后续调用方修改不能改变已提交输入', async () => {
    const source: AiFrozenResearch = {
      version: 'frozen-research-v1',
      prompt: { version: 'journal-review-v1', template: '原始提示' },
      source: {
        tool: 'getJournalReview',
        permission: 'journal:read',
        evidence: {
          sourceId: 'journal:original',
          provider: 'thesis-ledger',
          fetchedAt: '2026-10-04T09:00:00Z',
          data: { quantity: '2.000000000000000001' },
        },
      },
    };
    const create = vi.fn(async ({ data }: { data: object }) => ({ id: 'frozen-run', ...data }));
    const transaction = { aiRun: { create }, $executeRaw: vi.fn(async () => 1) };
    let enter!: () => void;
    const gate = new Promise<void>((resolve) => {
      enter = resolve;
    });
    const routing = {
      read: vi.fn(async () => ({
        researchDefault: { providerId: 'selected-provider', model: 'selected-model' },
        revision: '7',
      })),
    };
    const providers = {
      strictReadyContract: vi.fn(() => ({
        provider: { id: 'selected-provider' },
        execution: {
          adapter: 'openai-compatible',
          mode: 'json_validated',
          readiness: { configurationFingerprint: 'selected-fingerprint' },
        },
      })),
    };
    const submission = new AiResearchSubmission(
      {
        $transaction: async (work: (tx: typeof transaction) => Promise<unknown>) => {
          await gate;
          return work(transaction);
        },
      } as never,
      providers as never,
      routing as never,
    );
    const pending = submission.start(
      { question: '核对冻结事实', context: { scope: 'portfolio' } },
      source,
    );
    source.prompt.template = '后续修改';
    source.source.evidence.data = { quantity: '999' };
    enter();
    await pending;
    expect(routing.read).toHaveBeenCalledWith(transaction);
    expect(transaction.$executeRaw).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          promptVersion: 'journal-review-v1',
          modelMetadata: expect.objectContaining({
            frozenResearch: expect.objectContaining({
              prompt: { version: 'journal-review-v1', template: '原始提示' },
              source: expect.objectContaining({
                evidence: expect.objectContaining({ data: { quantity: '2.000000000000000001' } }),
              }),
            }),
          }),
        }),
      }),
    );
  });
  it('事务内冻结显式默认，不按 Provider 列表顺序替换', async () => {
    const create = vi.fn(async ({ data }: { data: object }) => ({ id: 'run-default', ...data }));
    const providers = {
      strictReadyContract: vi.fn(() => ({
        provider: { id: 'selected-provider' },
        execution: {
          adapter: 'openai-compatible',
          mode: 'json_validated',
          readiness: { configurationFingerprint: 'selected-fingerprint' },
        },
      })),
    };
    const routing = {
      read: vi.fn(async () => ({
        researchDefault: { providerId: 'selected-provider', model: 'selected-model' },
        revision: '7',
      })),
    };
    const transaction = { aiRun: { create }, $executeRaw: vi.fn(async () => 1) };
    const service = new AiRunService(
      {
        $transaction: async (work: (tx: typeof transaction) => Promise<unknown>) =>
          work(transaction),
      } as never,
      providers as never,
      routing as never,
    );
    await service.startResearch({ question: '风险？', context: { scope: 'portfolio' } });
    expect(routing.read).toHaveBeenCalledWith(transaction);
    expect(transaction.$executeRaw).toHaveBeenCalledTimes(1);
    expect(providers.strictReadyContract).toHaveBeenCalledWith(
      expect.objectContaining({ providerId: 'selected-provider', model: 'selected-model' }),
    );
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          provider: 'selected-provider',
          model: 'selected-model',
          modelMetadata: expect.objectContaining({
            researchDefault: { providerId: 'selected-provider', model: 'selected-model' },
            researchSettingsRevision: '7',
          }),
        }),
      }),
    );
  });

  it('未设置默认时阻断创建，事务内不产生新任务', async () => {
    const create = vi.fn();
    const transaction = { aiRun: { create }, $executeRaw: vi.fn(async () => 1) };
    const service = new AiRunService(
      {
        $transaction: async (work: (tx: typeof transaction) => Promise<unknown>) =>
          work(transaction),
      } as never,
      { defaultModel: () => 'legacy-model' } as never,
      { read: async () => ({ researchDefault: null, revision: '0' }) } as never,
    );
    await expect(
      service.startResearch({ question: '风险？', context: { scope: 'portfolio' } }),
    ).rejects.toThrow('请先选择研究默认模型');
    expect(create).not.toHaveBeenCalled();
  });
});
