import { describe, expect, it } from 'vitest';
import {
  backtestPeriodLabel,
  backtestProgressLabel,
  backtestResultSummary,
  backtestStatusSummary,
  experimentProgressLabel,
  experimentSourceLabel,
  experimentStageLabel,
  experimentStatusLabel,
  formatCompactDateTime,
} from '../src/features/strategy/strategy-list-presentation.js';
import type { OptimizationExperimentSummary } from '../src/features/strategy/strategy-optimization.api.js';
import type { BacktestJobSummary } from '../src/features/strategy/strategy.types.js';

const job = (overrides: Partial<BacktestJobSummary> = {}): BacktestJobSummary => ({
  id: 'job-1',
  strategyVersionId: 'version-1',
  status: 'running',
  ...overrides,
});

const experiment = (
  overrides: Partial<OptimizationExperimentSummary> = {},
): OptimizationExperimentSummary =>
  ({
    id: 'experiment-1',
    name: '验证实验',
    nameSource: 'stored',
    baselineStrategyVersionId: 'version-1',
    status: 'running',
    stage: 'evaluating',
    objective: {},
    split: {},
    modelConfig: [],
    aiCallsUsed: 0,
    backtestRunsUsed: 0,
    inputTokensUsed: 0,
    outputTokensUsed: 0,
    costUsed: null,
    costSummary: {} as OptimizationExperimentSummary['costSummary'],
    createdAt: '2026-09-18T12:34:00.000Z',
    updatedAt: '2026-09-18T12:34:00.000Z',
    ...overrides,
  }) as OptimizationExperimentSummary;

describe('策略中心列表展示规则', () => {
  it('分别格式化业务区间和紧凑本地时间', () => {
    expect(backtestPeriodLabel(job({ period: { start: '2025-01-02', end: '2025-08-31' } }))).toBe(
      '2025/01/02 – 2025/08/31',
    );
    expect(formatCompactDateTime('2026-09-18T12:34:00.000Z')).toMatch(/^\d{2}\/\d{2} \d{2}:\d{2}$/);
    expect(formatCompactDateTime('invalid')).toBe('时间未记录');
  });

  it('只使用真实任务状态、进度和结果事实', () => {
    expect(
      backtestStatusSummary([
        job({ id: 'failed', status: 'failed' }),
        job({ id: 'queued', status: 'queued' }),
        job({ id: 'running', status: 'running' }),
      ]),
    ).toBe('1 失败 · 1 运行中 · 1 排队中');
    expect(backtestProgressLabel(job({ progress: 37.6 }))).toBe('进度 38%');
    expect(backtestProgressLabel(job({ progress: null }))).toBeNull();
    expect(
      backtestResultSummary(
        job({
          status: 'succeeded',
          resultMetrics: {
            totalReturn: { status: 'available', value: '0.1234' },
            maxDrawdown: { status: 'available', value: '-0.0567' },
            sharpe: { status: 'available', value: '1.234' },
          },
        }),
      ),
    ).toBe('收益 12.34% · 回撤 5.67% · 夏普 1.23');
    expect(backtestResultSummary(job({ status: 'succeeded' }))).toBe('结果已生成');
    expect(backtestResultSummary(job({ status: 'failed', errorSummary: '行情数据不可用' }))).toBe(
      '行情数据不可用',
    );
    expect(backtestResultSummary(job({ status: 'running' }))).toBe('尚未产生结果');
  });

  it('将实验来源、状态、阶段和已有产出转为中文业务信息', () => {
    const existing = experiment({
      source: {
        kind: 'existing',
        strategyId: '00000000-0000-4000-8000-000000000001',
        strategyVersionId: '00000000-0000-4000-8000-000000000002',
        strategyName: '均线趋势',
        version: 3,
        schemaVersion: 2,
      },
      aiCallsUsed: 2,
      backtestRunsUsed: 5,
      selectedCandidateId: 'candidate-1',
    });
    expect(experimentSourceLabel(existing)).toBe('基于「均线趋势」v3');
    expect(experimentStatusLabel('failed')).toBe('失败');
    expect(experimentStageLabel('proposing')).toBe('候选生成');
    expect(experimentProgressLabel(existing)).toBe('AI 调用 2 · 回测 5 · 已选择候选');
    expect(experimentProgressLabel(experiment())).toBe('尚无产出');
  });
});
