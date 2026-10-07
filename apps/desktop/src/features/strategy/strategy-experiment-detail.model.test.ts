import { describe, expect, it } from 'vitest';
import type {
  OptimizationCandidate,
  OptimizationExperimentSummary,
} from './strategy-optimization.api.js';
import {
  candidateAdoptionEligibility,
  canSelectCandidateForTest,
  experimentStopReasonText,
} from './strategy-experiment-detail.model.js';

const experiment = { stage: 'awaiting_finalization' } as OptimizationExperimentSummary;
const candidate = (development: string, validation: string) =>
  ({
    validationStatus: 'restricted',
    readEligibility: { state: 'restricted', code: 'HISTORICAL_REVEAL_UNKNOWN' },
    metrics: {
      development: { status: development },
      validation: { status: validation },
    },
  }) as unknown as OptimizationCandidate;

describe('封存测试候选选择', () => {
  it('测试字段受保护时仍允许开发与验证均有效的候选进入锁定批次', () => {
    expect(canSelectCandidateForTest(experiment, candidate('valid', 'valid'), false)).toBe(true);
  });

  it('不把验证失败、缺失或未受保护的状态当成有效候选', () => {
    expect(canSelectCandidateForTest(experiment, candidate('valid', 'invalid'), false)).toBe(false);
    expect(canSelectCandidateForTest(experiment, candidate('valid', ''), false)).toBe(false);
    expect(
      canSelectCandidateForTest(
        experiment,
        {
          ...candidate('valid', 'valid'),
          readEligibility: { state: 'readable' },
        } as unknown as OptimizationCandidate,
        false,
      ),
    ).toBe(false);
  });

  it('非锁定阶段或需要先恢复的实验不能选择候选', () => {
    const validCandidate = candidate('valid', 'valid');
    expect(
      canSelectCandidateForTest({ ...experiment, stage: 'testing' }, validCandidate, false),
    ).toBe(false);
    expect(canSelectCandidateForTest(experiment, validCandidate, true)).toBe(false);
  });
});

describe('实验终态原因文案', () => {
  it('区分模型格式失败和候选验证失败', () => {
    expect(experimentStopReasonText('model_format_failure')).toBe('模型输出格式无效，未生成候选');
    expect(experimentStopReasonText('no_valid_candidate')).toBe('所有候选均未通过验证');
  });
});

describe('封存测试候选状态文案', () => {
  const completedExperiment = {
    status: 'succeeded',
    stage: 'completed',
    readEligibility: { state: 'readable' },
    lockedCandidateIds: ['selected'],
  } as unknown as OptimizationExperimentSummary;
  const readableCandidate = {
    id: 'unselected',
    validationStatus: 'valid',
    readEligibility: { state: 'readable' },
  } as unknown as OptimizationCandidate;

  it('区分未进入封存测试和已进入但未通过的候选', () => {
    expect(candidateAdoptionEligibility(completedExperiment, readableCandidate)).toBe(
      '未进入封存测试',
    );
    expect(
      candidateAdoptionEligibility(completedExperiment, {
        ...readableCandidate,
        id: 'selected',
        validationStatus: 'test_failed',
      }),
    ).toBe('候选未通过封存测试');
  });

  it('测试结果未揭示时不区分锁定批次和测试终态', () => {
    expect(
      candidateAdoptionEligibility(
        {
          ...completedExperiment,
          readEligibility: {
            state: 'restricted',
            code: 'TEST_NOT_REVEALED',
            scope: 'test',
            accessedAt: null,
            revealedAt: null,
          },
        },
        readableCandidate,
      ),
    ).toBe('封存测试结果尚未揭示');
  });
});
