import { describe, expect, it, vi } from 'vitest';
import { ResultReadPolicyService } from '../../src/platform/result-read-policy.service.js';

describe('统一封存结果读取门禁', () => {
  it('不把访问事实当作揭示，并删除实验测试结果旁路', () => {
    const policy = new ResultReadPolicyService({} as never);
    const result = policy.protectExperiment({
      id: 'experiment-1',
      testExposedAt: new Date('2026-09-18T00:00:00.000Z'),
      exposure: { testAccessStarted: true },
      baselineRunRefs: { validation: 'validation-run', test: 'test-run' },
      baselineMetrics: { validation: { score: 1 }, test: { score: 99 } },
      selectedCandidateId: 'candidate-1',
    });
    expect(result).toMatchObject({
      baselineRunRefs: { validation: 'validation-run' },
      baselineMetrics: { validation: { score: 1 } },
      selectedCandidateId: null,
      readEligibility: {
        state: 'restricted',
        code: 'HISTORICAL_REVEAL_UNKNOWN',
      },
    });
    expect(result.baselineRunRefs).not.toHaveProperty('test');
    expect(result.baselineMetrics).not.toHaveProperty('test');
  });

  it('揭示后保留冻结字段，候选状态和指标不被误删', () => {
    const policy = new ResultReadPolicyService({} as never);
    const eligibility = policy.experiment({ exposure: { testRevealed: true } });
    const candidate = policy.protectCandidate(
      {
        id: 'candidate-1',
        runRefs: { validation: 'validation-run', test: 'test-run' },
        metrics: { validation: { score: 1 }, test: { score: 2 } },
        validationStatus: 'test_invalid',
      },
      eligibility,
    );
    expect(candidate).toMatchObject({
      validationStatus: 'test_invalid',
      metrics: { test: { score: 2 } },
      readEligibility: { state: 'readable', code: 'READABLE' },
    });
  });

  it('已知测试直链在揭示前只返回稳定限制码，用户直链保持可读', async () => {
    const prisma = {
      $queryRaw: vi.fn(async () => [
        {
          runId: 'test-run',
          optimizationProvenance: true,
          hasAssociation: true,
          split: 'test',
          testExposedAt: new Date('2026-09-18T00:00:00.000Z'),
          exposure: { testRevealed: false },
        },
        {
          runId: 'user-run',
          optimizationProvenance: false,
          hasAssociation: false,
          split: null,
          testExposedAt: null,
          exposure: null,
        },
      ]),
    };
    const policy = new ResultReadPolicyService(prisma as never);
    const [protectedJob, userJob] = await policy.protectBacktestJobs([
      { id: 'test-run', result: { metrics: { score: 99 } }, diagnostics: { secret: true } },
      { id: 'user-run', result: { metrics: { score: 1 } } },
    ]);
    expect(protectedJob).toMatchObject({
      readEligibility: { state: 'restricted', code: 'TEST_NOT_REVEALED' },
    });
    expect(protectedJob).not.toHaveProperty('result');
    expect(protectedJob).not.toHaveProperty('diagnostics');
    expect(userJob).toMatchObject({
      result: { metrics: { score: 1 } },
      readEligibility: { state: 'readable', code: 'RUN_NOT_ASSOCIATED' },
    });
  });

  it('缺失优化引用时仍依据持久化回测来源 fail-closed', async () => {
    const prisma = {
      $queryRaw: vi.fn(async () => [
        {
          runId: 'candidate-run',
          optimizationProvenance: true,
          hasAssociation: false,
          split: null,
          testExposedAt: null,
          exposure: { testRevealed: true },
        },
        {
          runId: 'baseline-run',
          optimizationProvenance: true,
          hasAssociation: false,
          split: null,
          testExposedAt: null,
          exposure: null,
        },
        {
          runId: 'formal-user-run',
          optimizationProvenance: false,
          hasAssociation: false,
          split: null,
          testExposedAt: null,
          exposure: null,
        },
      ]),
    };
    const policy = new ResultReadPolicyService(prisma as never);
    const jobs = await policy.protectBacktestJobs([
      { id: 'candidate-run', result: { metrics: { score: 1 } } },
      { id: 'baseline-run', result: { metrics: { score: 2 } } },
      { id: 'formal-user-run', result: { metrics: { score: 3 } } },
    ]);
    expect(jobs[0]).toMatchObject({
      readEligibility: { state: 'restricted', code: 'HISTORICAL_REVEAL_UNKNOWN' },
    });
    expect(jobs[1]).toMatchObject({
      readEligibility: { state: 'restricted', code: 'HISTORICAL_REVEAL_UNKNOWN' },
    });
    expect(jobs[2]).toMatchObject({
      readEligibility: { state: 'readable', code: 'RUN_NOT_ASSOCIATED' },
      result: { metrics: { score: 3 } },
    });
    expect(jobs[0]).not.toHaveProperty('result');
    expect(jobs[1]).not.toHaveProperty('result');
  });
});
