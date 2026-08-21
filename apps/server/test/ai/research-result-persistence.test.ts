import { describe, expect, it, vi } from 'vitest';
import { AiRunService } from '../../src/ai/ai.service.js';

const time = '2025-01-01T01:00:00Z';

const validResearchResult = {
  version: 1 as const,
  provider: 'dsa-fork',
  symbol: '600519.SH',
  conclusion: '维持观察。',
  evidence: [
    {
      claim: '报价可用',
      citations: [
        {
          tool: 'quote',
          sourceId: '600519.SH',
          provider: 'dsa-fork',
          observedAt: time,
        },
      ],
    },
  ],
  risks: [],
  unknowns: [],
  disclaimer: '仅供研究参考，不构成投资建议。',
  createdAt: time,
};

describe('AiRun research persistence', () => {
  it('仅持久化通过 ResearchResult V1 校验的研究结果', async () => {
    const update = vi.fn(async ({ data }: { data: object }) => ({ id: 'run-1', ...data }));
    const service = new AiRunService({ aiRun: { update } } as never);

    await expect(
      service.finishResearch(
        'run-1',
        validResearchResult,
        { inputTokens: 10, outputTokens: 5, cost: 0.01 },
        25,
      ),
    ).resolves.toMatchObject({
      id: 'run-1',
      status: 'succeeded',
      result: { provider: 'dsa-fork', signals: [] },
      durationMs: 25,
    });

    expect(() =>
      service.finishResearch(
        'run-1',
        { ...validResearchResult, evidence: [{ claim: '无来源', citations: [] }] },
        { inputTokens: 0, outputTokens: 0, cost: 0 },
      ),
    ).toThrow();
    expect(update).toHaveBeenCalledTimes(1);
  });
});
