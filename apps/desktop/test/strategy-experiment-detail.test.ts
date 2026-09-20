import { describe, expect, it, vi } from 'vitest';
import type { OptimizationCostSummary } from '@thesis-ledger/schemas';
import {
  candidateAdoptionEligibility,
  canRevealTestMetrics,
  experimentCostText,
  experimentUsageText,
  experimentStopReasonText,
  tradingCostText,
} from '../src/features/strategy/strategy-experiment-detail.model.js';
import type {
  OptimizationCandidate,
  OptimizationExperimentSummary,
} from '../src/features/strategy/strategy-optimization.api.js';
import {
  adoptOptimizationCandidate,
  fetchOptimizationAdoptionContext,
} from '../src/features/strategy/strategy-optimization.api.js';
import type { DesktopRequestClient } from '../src/features/shared/request.js';

const experiment = (overrides: Partial<OptimizationExperimentSummary> = {}) =>
  ({
    id: 'experiment-1',
    name: '实验',
    nameSource: 'stored',
    baselineStrategyVersionId: 'version-1',
    status: 'succeeded',
    stage: 'completed',
    objective: {},
    split: {},
    modelConfig: [],
    aiCallsUsed: 1,
    backtestRunsUsed: 2,
    inputTokensUsed: 3,
    outputTokensUsed: 4,
    costUsed: null,
    costSummary: {
      status: 'unavailable',
      currency: null,
      knownAmount: null,
      knownByCurrency: [],
      reason: 'unknown_cost',
    },
    tradingCost: {
      source: 'discovery_seed',
      commissionRate: '0',
      slippageRate: '0',
      isAssumption: true,
      zeroDoesNotMeanFree: true,
    },
    readEligibility: {
      state: 'readable',
      code: 'READABLE',
      scope: 'test',
      accessedAt: '2026-09-18T00:00:00.000Z',
      revealedAt: '2026-09-18T00:00:00.000Z',
    },
    createdAt: '2026-09-18T00:00:00.000Z',
    updatedAt: '2026-09-18T00:00:00.000Z',
    ...overrides,
  }) satisfies OptimizationExperimentSummary;

const candidate = (overrides: Partial<OptimizationCandidate> = {}) =>
  ({
    id: 'candidate-1',
    experimentId: 'experiment-1',
    candidateNumber: 1,
    modelKey: 'provider:model',
    candidateStrategyVersionId: 'candidate-version-1',
    executionHash: 'hash',
    proposal: {},
    diff: [],
    validationStatus: 'test_valid',
    runRefs: {},
    metrics: {},
    readEligibility: {
      state: 'readable',
      code: 'READABLE',
      scope: 'test',
      accessedAt: '2026-09-18T00:00:00.000Z',
      revealedAt: '2026-09-18T00:00:00.000Z',
    },
    ...overrides,
  }) satisfies OptimizationCandidate;

describe('策略实验详情', () => {
  it('仅在实验与候选都明确可读时揭示封存指标', () => {
    expect(canRevealTestMetrics(experiment(), candidate())).toBe(true);
    expect(canRevealTestMetrics(experiment({ readEligibility: undefined }), candidate())).toBe(
      false,
    );
    expect(canRevealTestMetrics(experiment(), candidate({ readEligibility: undefined }))).toBe(
      false,
    );
  });

  it('采纳动作同时依赖揭示、完成状态和候选资格', () => {
    expect(candidateAdoptionEligibility(experiment(), candidate())).toBeNull();
    expect(
      candidateAdoptionEligibility(
        experiment({ status: 'awaiting_finalization', stage: 'awaiting_finalization' }),
        candidate(),
      ),
    ).toBe('实验尚未完成封存测试');
    expect(
      candidateAdoptionEligibility(experiment(), candidate({ validationStatus: 'test_invalid' })),
    ).toBe('候选未通过封存测试');
  });

  it('费用未知、部分已知和多币种均不伪装为精确总额', () => {
    const summary = (value: Partial<OptimizationCostSummary>): OptimizationCostSummary => ({
      status: 'unavailable',
      currency: null,
      knownAmount: null,
      knownByCurrency: [],
      reason: 'unknown_cost',
      ...value,
    });
    expect(experimentCostText(summary({}))).toBe('费用未知');
    expect(
      experimentCostText(summary({ status: 'partial', currency: 'USD', knownAmount: '1.25' })),
    ).toBe('已确认至少 USD 1.25');
    expect(
      experimentCostText(
        summary({
          status: 'mixed_currency',
          reason: 'mixed_currency',
          knownByCurrency: [
            { currency: 'USD', amount: '1.25' },
            { currency: 'CNY', amount: '8.00' },
          ],
        }),
      ),
    ).toBe('分币种已确认：USD 1.25，CNY 8.00');
  });

  it('未知用量不显示为零，并将 seed 交易成本与 AI 费用分开', () => {
    expect(experimentUsageText(experiment(), [])).toBe('历史未核对');
    expect(
      experimentUsageText(experiment(), [
        {
          id: 'attempt-1',
          experimentId: 'experiment-1',
          modelKey: 'provider:model',
          attempt: 1,
          status: 'failed',
          createdAt: '2026-09-19T00:00:00.000Z',
          usageCompleteness: 'unknown',
        },
      ]),
    ).toBe('包含未知用量');
    expect(tradingCostText(experiment().tradingCost)).toEqual([
      '来源：服务端 discovery seed',
      '佣金 0 / 滑点 0',
      '零佣金与零滑点仅是回测假设，不代表真实交易免费',
    ]);
  });

  it('区分无有效候选、用户取消与技术或预算停止原因', () => {
    expect(experimentStopReasonText('no_valid_candidate')).toBe('所有候选均未通过验证');
    expect(experimentStopReasonText('user_cancelled')).toBe('用户已取消实验');
    expect(experimentStopReasonText('budget_exhausted')).toContain('技术或预算限制');
  });

  it('使用精确实验和候选标识读取三方差异，并原样提交确认版本与幂等意图', async () => {
    const request = vi.fn().mockResolvedValue({});
    const client = { request } as unknown as DesktopRequestClient;

    await fetchOptimizationAdoptionContext('experiment/id', 'candidate id', client);
    expect(request).toHaveBeenNthCalledWith(
      1,
      '/strategy-optimization/experiments/experiment%2Fid/adopt-context?candidateId=candidate%20id',
      undefined,
    );

    await adoptOptimizationCandidate(
      'experiment/id',
      {
        candidateId: 'candidate id',
        candidateHash: 'hash-1',
        expectedStrategyVersion: 7,
        idempotencyKey: 'intent-1',
        acknowledgeTestExposure: true,
      },
      client,
    );
    expect(request).toHaveBeenNthCalledWith(
      2,
      '/strategy-optimization/experiments/experiment%2Fid/adopt',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          candidateId: 'candidate id',
          candidateHash: 'hash-1',
          expectedStrategyVersion: 7,
          idempotencyKey: 'intent-1',
          acknowledgeTestExposure: true,
        }),
      }),
    );
  });
});
