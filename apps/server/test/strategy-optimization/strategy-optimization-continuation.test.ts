import { describe, expect, it, vi } from 'vitest';
import { StrategyOptimizationService } from '../../src/strategy-optimization/strategy-optimization.service.js';
import { StrategyCapabilityGapError } from '../../src/strategy-optimization/strategy-optimization-capability-gap.js';
import { OptimizationBacktestFailure } from '../../src/strategy-optimization/strategy-optimization-failure.js';
import { completeSnapshotFixture } from '../backtest/v3-complete-snapshot-fixtures.js';

describe('strategy optimization continuation gate', () => {
  it('旧冻结配置不足时生成模型请求前阻断', async () => {
    const { input } = await completeSnapshotFixture();
    const candidateService = { generateProposal: vi.fn() };
    const runs = {
      assertFrozenResearchBudget: vi.fn(async () => {
        throw new Error('请重新准备配置后新建实验');
      }),
    };
    const prisma = {
      $queryRaw: vi.fn(async () => [{ id: 'experiment', baselineStrategyVersionId: 'baseline' }]),
      strategyVersion: { findUnique: vi.fn(async () => ({ schema: input.strategy })) },
    };
    const service = new StrategyOptimizationService(
      prisma as never,
      {} as never,
      candidateService as never,
      {} as never,
      runs as never,
      {} as never,
    );
    await expect(
      (service as unknown as { processClaimed(id: string): Promise<unknown> }).processClaimed(
        'experiment',
      ),
    ).rejects.toThrow('请重新准备');
    expect(candidateService.generateProposal).not.toHaveBeenCalled();
  });
  it('模型成功后候选技术失败立即停止轮次，保留具体原因', async () => {
    const { input } = await completeSnapshotFixture();
    const candidateService = {
      generateProposal: vi.fn(async () => ({ proposal: {}, aiRunId: 'ai-run' })),
      createAndEvaluateCandidate: vi.fn(async () => {
        throw new OptimizationBacktestFailure(
          'DATA_UNAVAILABLE',
          '不复权参考冻结窗口不足',
          'failed-run',
        );
      }),
      recordAttempt: vi.fn(),
    };
    const service = new StrategyOptimizationService(
      { $queryRaw: vi.fn(async () => []), $executeRaw: vi.fn(async () => 1) } as never,
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
    const reason = await (
      service as unknown as {
        processModelRounds(experiment: unknown, baseline: unknown): Promise<string | undefined>;
      }
    ).processModelRounds(
      { id: 'experiment', maxRounds: 3, modelConfig: [{ provider: 'fixture', model: 'model' }] },
      { strategy: input.strategy },
    );
    expect(reason).toBe('[数据不可用] 不复权参考冻结窗口不足');
    expect(candidateService.generateProposal).toHaveBeenCalledOnce();
  });
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

it('能力报告仅停止对应模型，其他模型继续；已结算报告不改记为失败或重复回测', async () => {
  const { input } = await completeSnapshotFixture();
  const candidateService = {
    generateProposal: vi.fn(
      async (
        _experiment: unknown,
        _baseline: unknown,
        _descriptors: unknown,
        route: { model: string },
      ) => {
        if (route.model === 'gap')
          throw new StrategyCapabilityGapError({
            status: 'unsupported',
            originalRule: '按财报选组合',
            reason: '缺时点财报和多资产执行',
            gaps: [{ path: 'executionInstrument', kind: 'execution', detail: '只有唯一下单标的' }],
            supportedParts: [],
            evidenceRefs: [],
          });
        return { proposal: {}, aiRunId: 'ai-run' };
      },
    ),
    createAndEvaluateCandidate: vi.fn(async () => undefined),
    recordAttempt: vi.fn(),
  };
  const service = new StrategyOptimizationService(
    { $queryRaw: vi.fn(async () => []), $executeRaw: vi.fn(async () => 1) } as never,
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
  await (
    service as unknown as {
      processModelRounds(experiment: unknown, baseline: unknown): Promise<unknown>;
    }
  ).processModelRounds(
    {
      id: 'fixture',
      maxRounds: 3,
      modelConfig: [
        { provider: 'fixture', model: 'gap' },
        { provider: 'fixture', model: 'supported' },
      ],
    },
    { strategy: input.strategy },
  );
  expect(candidateService.generateProposal.mock.calls.map((call) => call[3].model)).toEqual([
    'gap',
    'supported',
    'supported',
  ]);
  expect(candidateService.createAndEvaluateCandidate).toHaveBeenCalledTimes(2);
  expect(candidateService.recordAttempt).not.toHaveBeenCalled();
});
