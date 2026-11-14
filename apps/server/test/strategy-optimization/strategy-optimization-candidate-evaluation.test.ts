import { describe, expect, it, vi } from 'vitest';
import { evaluateOptimizationCandidate } from '../../src/strategy-optimization/strategy-optimization-candidate-evaluation.js';
import { OptimizationBacktestFailure } from '../../src/strategy-optimization/strategy-optimization-failure.js';
import type {
  CandidateRow,
  ExperimentRow,
} from '../../src/strategy-optimization/strategy-optimization-common.js';

const candidate = {
  id: 'candidate',
  candidateStrategyVersionId: 'version',
  runRefs: {},
  metrics: {},
  validationStatus: 'evaluating',
} as CandidateRow;
const experiment = {
  id: 'experiment',
  frozenDataFingerprints: { development: 'dev', validation: 'val' },
} as ExperimentRow;
const completed = (id: string, valid = true) => ({
  run: { id },
  fingerprint: id,
  summary: {
    runId: id,
    status: valid ? 'valid' : 'invalid',
    completeness: 'complete',
    tradeCount: valid ? 2 : 0,
  },
});
const setup = () => {
  const saved: Array<{ refs: unknown; metrics: unknown; status: unknown }> = [];
  const prisma = {
    $executeRaw: vi.fn(async (sql) => {
      saved.push({
        refs: JSON.parse(sql.values[0]),
        metrics: JSON.parse(sql.values[1]),
        status: sql.values[2],
      });
      return 1;
    }),
  };
  const runs = { evaluateCandidateSplit: vi.fn() };
  return {
    prisma,
    runs,
    saved,
    evaluate: () =>
      evaluateOptimizationCandidate(prisma as never, runs as never, experiment, candidate),
  };
};

describe('候选切分失败留存', () => {
  it('成功 Run 的无效摘要保留原验证流程，不误当执行异常', async () => {
    const f = setup();
    f.runs.evaluateCandidateSplit.mockResolvedValue({ ...completed('dev-run', false),
      summary: { ...completed('dev-run', false).summary, failureCategory: 'protocol-incompatible', reason: '冻结指纹不一致' } });
    await expect(f.evaluate()).resolves.toMatchObject({ validationStatus: 'invalid' });
    expect(f.runs.evaluateCandidateSplit).toHaveBeenCalledTimes(2);
    expect(f.saved[1]).toMatchObject({ status: 'invalid', refs: { development: 'dev-run' } });
  });

  it('终态已被其他执行者提交时拒绝覆盖', async () => {
    const f = setup();
    f.prisma.$executeRaw.mockResolvedValue(0);
    f.runs.evaluateCandidateSplit.mockResolvedValue(completed('dev-run'));
    await expect(f.evaluate()).rejects.toThrow('评估状态已变化');
    expect(f.runs.evaluateCandidateSplit).toHaveBeenCalledOnce();
  });
  it('开发失败保留失败 Run 和原因，候选收敛无效且不继续验证', async () => {
    const f = setup();
    const failure = new OptimizationBacktestFailure(
      'DATA_UNAVAILABLE',
      '原价冻结窗口不足',
      'failed-dev',
    );
    f.runs.evaluateCandidateSplit.mockRejectedValue(failure);
    await expect(f.evaluate()).rejects.toBe(failure);
    expect(f.runs.evaluateCandidateSplit).toHaveBeenCalledOnce();
    expect(f.saved).toEqual([
      {
        refs: { development: 'failed-dev' },
        status: 'invalid',
        metrics: {
          development: {
            runId: 'failed-dev',
            status: 'invalid',
            completeness: 'unavailable',
            tradeCount: 0,
            failureCategory: 'data-unavailable',
            reason: '[数据不可用] 原价冻结窗口不足',
          },
        },
      },
    ]);
  });

  it('验证失败保留已落库的开发结果和验证失败 Run', async () => {
    const f = setup();
    f.runs.evaluateCandidateSplit
      .mockResolvedValueOnce(completed('dev-run'))
      .mockRejectedValueOnce(
        new OptimizationBacktestFailure('DATA_UNAVAILABLE', '验证来源失败', 'failed-val'),
      );
    await expect(f.evaluate()).rejects.toThrow('验证来源失败');
    expect(f.saved[0]).toMatchObject({ refs: { development: 'dev-run' }, status: 'evaluating' });
    expect(f.saved[1]).toMatchObject({
      refs: { development: 'dev-run', validation: 'failed-val' },
      status: 'invalid',
      metrics: {
        development: completed('dev-run').summary,
        validation: { reason: '[数据不可用] 验证来源失败' },
      },
    });
  });

  it.each([true, false])('正常评估有效性 %s 不改写为技术异常', async (valid) => {
    const f = setup();
    f.runs.evaluateCandidateSplit
      .mockResolvedValueOnce(completed('dev-run', valid))
      .mockResolvedValueOnce(completed('val-run'));
    await expect(f.evaluate()).resolves.toMatchObject({
      validationStatus: valid ? 'valid' : 'invalid',
      runRefs: { development: 'dev-run', validation: 'val-run' },
    });
    expect(f.saved).toHaveLength(2);
  });

  it('Run 创建前异常仍保存具体原因，不伪造 Run 或数据错误类别', async () => {
    const f = setup();
    f.runs.evaluateCandidateSplit.mockRejectedValue(new Error('策略预热超出冻结预算'));
    await expect(f.evaluate()).rejects.toBeInstanceOf(OptimizationBacktestFailure);
    expect(f.saved[0]).toMatchObject({
      refs: {},
      status: 'invalid',
      metrics: {
        development: { status: 'invalid', reason: '策略预热超出冻结预算' },
      },
    });
    expect(f.saved[0]!.metrics).not.toHaveProperty('development.runId');
    expect(f.saved[0]!.metrics).not.toHaveProperty('development.failureCategory');
  });
});
