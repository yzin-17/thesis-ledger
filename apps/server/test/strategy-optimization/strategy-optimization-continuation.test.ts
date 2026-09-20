import { describe, expect, it, vi } from 'vitest';
import { StrategyOptimizationService } from '../../src/strategy-optimization/strategy-optimization.service.js';

describe('strategy optimization continuation gate', () => {
  it('结果与计量已保存但超额时，不创建候选或发起回测', async () => {
    const candidateService = {
      generateProposal: vi.fn(async () => ({
        proposal: { changes: [{ parameterId: 'risk.0.percent', value: '0.07' }] },
        aiRunId: '00000000-0000-4000-8000-000000000001',
        modelKey: 'fixture:model',
        continuationBlockedReason: 'budget_exceeded',
      })),
      createAndEvaluateCandidate: vi.fn(),
      recordAttempt: vi.fn(),
    };
    const service = new StrategyOptimizationService(
      { $queryRaw: vi.fn(async () => []) } as never,
      {} as never,
      candidateService as never,
      {} as never,
      {} as never,
      {} as never,
    );
    vi.spyOn(
      service as unknown as { cancelled(id: string): Promise<boolean> },
      'cancelled',
    ).mockResolvedValue(false);

    const blocked = await (
      service as unknown as {
        processRound(
          experiment: unknown,
          baseline: unknown,
          descriptors: unknown[],
          route: unknown,
          round: number,
        ): Promise<string | null>;
      }
    ).processRound(
      { id: '00000000-0000-4000-8000-000000000002' },
      { strategy: {} },
      [],
      { provider: 'fixture', model: 'model' },
      1,
    );

    expect(blocked).toBe('budget_exceeded');
    expect(candidateService.createAndEvaluateCandidate).not.toHaveBeenCalled();
    expect(candidateService.recordAttempt).not.toHaveBeenCalled();
  });
});
