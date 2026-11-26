import { describe, expect, it, vi } from 'vitest';
import type { OptimizationCostSummary } from '@thesis-ledger/schemas';
import {
  candidateAdoptionEligibility,
  canRevealTestMetrics,
  experimentCostText,
  experimentUsageText,
  experimentStopReasonText,
  tradingCostText,
  metricValue,
  latestExperimentAdoption,
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
import { strategySummaryVersion } from './strategy-summary-ratio-samples';
import type { StrategyRecord } from '../src/features/strategy/strategy.types.js';

describe('实验已采纳版本投影', () => {
  const strategies = [{ id: 'strategy', versions: [
    { id: 'formal-1', version: 1 }, { id: 'formal-2', version: 2 },
    { id: 'formal-3', version: 3 }, { id: 'manual-9', version: 9 },
  ] }] as unknown as StrategyRecord[];
  const first = { adoptedStrategyVersionId: 'formal-1' };
  const second = { adoptedStrategyVersionId: 'formal-2' };
  it.each([[first, second], [second, first]])('刷新与候选顺序均选择本实验最高版本', (...candidates) => {
    expect(latestExperimentAdoption(candidates, strategies)).toEqual({ id: 'formal-2', strategyId: 'strategy', version: 2 });
  });
  it('兼容尚未读回的本地回执，并接受更新后的较高采纳版本', () => {
    const receipt = { id: 'formal-2', strategyId: 'strategy', version: 2 };
    expect(latestExperimentAdoption([first], strategies, receipt)).toEqual(receipt);
    expect(latestExperimentAdoption([{ adoptedStrategyVersionId: 'formal-3' }], strategies, receipt)?.version).toBe(3);
    expect(latestExperimentAdoption([{ adoptedStrategyVersionId: 'missing' }], strategies)).toBeNull();
  });
});

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
  it('收益和回撤按比例显示两位百分比，交易数量及原始值保持不变', () => {
    const metrics = {
      totalReturn: '0.00195553178350810746',
      maxDrawdown: '-0.024960676825349179915',
      closedTradeCount: 11,
    };
    const original = structuredClone(metrics);
    expect(metricValue(metrics, ['totalReturn', 'return'], 'percent')).toBe('0.20%');
    expect(metricValue(metrics, ['maxDrawdown'], 'percent')).toBe('-2.50%');
    expect(metricValue({ return: '-0.10343877948424885324' }, ['totalReturn', 'return'], 'percent')).toBe('-10.34%');
    expect(metricValue({ totalReturn: 0 }, ['totalReturn'], 'percent')).toBe('0.00%');
    expect(metricValue(metrics, ['closedTradeCount', 'tradeCount'])).toBe('11');
    expect(metrics).toEqual(original);
  });

  it('缺失和不可用指标不伪装为零，已声明可用的指标复用百分比投影', () => {
    for (const value of [null, undefined, '', 'invalid', Infinity, { status: 'unavailable', value: '0.1' }]) {
      expect(metricValue({ totalReturn: value }, ['totalReturn'], 'percent')).toBe('不可用');
    }
    expect(metricValue({ totalReturn: { status: 'available', value: '0.123456' } }, ['totalReturn'], 'percent')).toBe('12.35%');
  });

  it('仅在实验与候选都明确可读时揭示封存指标', () => {
    expect(canRevealTestMetrics(experiment(), candidate())).toBe(true);
    expect(canRevealTestMetrics(experiment({ readEligibility: undefined }), candidate())).toBe(
      false,
    );
    expect(canRevealTestMetrics(experiment(), candidate({ readEligibility: undefined }))).toBe(
      false,
    );
  });

  it('采纳动作依赖揭示与完成状态，不要求评价合格', () => {
    expect(candidateAdoptionEligibility(experiment(), candidate())).toBeNull();
    expect(
      candidateAdoptionEligibility(
        experiment({ status: 'awaiting_finalization', stage: 'awaiting_finalization' }),
        candidate(),
      ),
    ).toBe('实验尚未完成封存测试');
    expect(
      candidateAdoptionEligibility(experiment(), candidate({ validationStatus: 'test_invalid' })),
    ).toBeNull();
    expect(
      candidateAdoptionEligibility(
        experiment({ lockedCandidateIds: ['candidate-1'] }),
        candidate({ validationStatus: 'test_invalid' }),
      ),
    ).toBeNull();
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
    const id = '00000000-0000-4000-8000-000000000041';
    const candidateId = '00000000-0000-4000-8000-000000000042';
    const version = { id, strategyId: id, version: 7, schemaVersion: 1,
      schema: strategySummaryVersion('0.25').schema };
    const context = { experimentId: id, candidateId, expectedStrategyVersion: 7,
      baseline: version, current: version, candidate: { ...version, candidateId, executionHash: 'hash-1' },
      candidateVsBaseline: [], candidateVsCurrent: [] };
    const monitoringPlan = { semanticVersion: 'strategy-monitoring-v1', strategyHash: 'hash-1', planHash: 'plan-1',
      executionSymbol: '510300.SH', evaluationTimeframe: '1d', rules: [], coverage: { riskTotal: 0, riskMapped: 0, items: [] } };
    const request = vi.fn().mockResolvedValueOnce(context).mockResolvedValueOnce({
      strategyVersion: { id, strategyId: id, version: 8 }, adoptionContext: context, monitoringPlan,
      riskApplicationEnabled: false, riskApplicationDiffs: [],
    });
    const client = { request } as unknown as DesktopRequestClient;

    await fetchOptimizationAdoptionContext(id, candidateId, client);
    expect(request).toHaveBeenNthCalledWith(
      1,
      `/strategy-optimization/experiments/${id}/adopt-context?candidateId=${candidateId}`,
      expect.any(Object),
    );

    await adoptOptimizationCandidate(
      id,
      {
        candidateId,
        candidateHash: 'hash-1',
        expectedStrategyVersion: 7,
        idempotencyKey: 'intent-1',
        acknowledgeTestExposure: true,
      },
      client,
    );
    expect(request).toHaveBeenNthCalledWith(
      2,
      `/strategy-optimization/experiments/${id}/adopt`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          candidateId,
          candidateHash: 'hash-1',
          expectedStrategyVersion: 7,
          idempotencyKey: 'intent-1',
          acknowledgeTestExposure: true,
        }),
      }),
    );
  });
});
