import { describe, expect, it, vi } from 'vitest';
import { strategySchema } from '@thesis-ledger/schemas';
import { projectCandidateDefinitionDiff } from '../../src/strategy-optimization/strategy-optimization-candidate-diff.js';
import { StrategyOptimizationReadService } from '../../src/strategy-optimization/strategy-optimization-read.service.js';
import { ResultReadPolicyService } from '../../src/platform/result-read-policy.service.js';
import { strategy } from '../backtest/v2-execution.fixtures.js';

const marker = [{ kind: 'full-strategy', sourceMode: 'discovery' }];
const changed = strategySchema.parse({
  ...strategy,
  name: '改进策略',
  entry: {
    type: 'all',
    conditions: [
      strategy.entry,
      { type: 'not', expression: { type: 'positionState', field: 'isOpen' } },
    ],
  },
  risk: [{ type: 'fixedStop', percent: '0.05' }],
});

describe('完整候选的冻结定义差异', () => {
  it('按业务字段显示完整对象与数组，历史标记不回写', () => {
    const before = structuredClone({ marker, strategy, changed });
    const diff = projectCandidateDefinitionDiff(marker, strategy, changed) as Record<
      string,
      unknown
    >[];
    expect(diff.find((entry) => entry.path === '$.entry')).toMatchObject({
      before: strategy.entry,
      after: changed.entry,
    });
    expect(diff.find((entry) => entry.path === '$.risk')).toMatchObject({
      before: strategy.risk,
      after: changed.risk,
    });
    expect(diff.find((entry) => entry.path === '$.name')).toMatchObject({ after: '改进策略' });
    expect({ marker, strategy, changed }).toEqual(before);
  });
  it('参数差异保持原样，定义相同与版本缺失分别表达', () => {
    const parameters = [{ parameterId: 'risk.stop', before: '0.1', after: '0.05' }];
    expect(projectCandidateDefinitionDiff(parameters, null, null)).toBe(parameters);
    expect(projectCandidateDefinitionDiff(marker, strategy, strategy)).toEqual([
      { kind: 'full-strategy', status: 'unchanged' },
    ]);
    expect(projectCandidateDefinitionDiff(marker, null, changed)).toMatchObject([
      { status: 'unavailable', reason: expect.stringContaining('基线') },
    ]);
    expect(projectCandidateDefinitionDiff(marker, strategy, {})).toMatchObject([
      { status: 'unavailable', reason: expect.stringContaining('候选') },
    ]);
  });
  it('候选读取只查询一次并移除内部版本载荷，保留结果读取保护', async () => {
    const query = vi.fn().mockResolvedValue([
      {
        id: 'candidate',
        experimentId: 'experiment',
        candidateStrategyVersionId: 'frozen-candidate',
        candidateNumber: 1,
        diff: marker,
        baselineDefinition: strategy,
        candidateDefinition: changed,
        experimentStage: 'awaiting_finalization',
        experimentExposure: {},
        experimentTestExposedAt: null,
        metrics: { validation: { totalReturn: '0.1' }, test: { totalReturn: 'hidden-test' } },
        runRefs: { validation: 'validation-run', test: 'hidden-run' },
      },
    ]);
    const service = new StrategyOptimizationReadService(
      { $queryRaw: query } as never,
      { list: () => [] } as never,
      new ResultReadPolicyService({} as never),
    );
    const [result] = await service.candidates('experiment');
    expect(query).toHaveBeenCalledTimes(1);
    expect(result?.diff).toEqual(projectCandidateDefinitionDiff(marker, strategy, changed));
    expect(result).not.toHaveProperty('baselineDefinition');
    expect(result).not.toHaveProperty('candidateDefinition');
    expect(JSON.stringify(result)).not.toContain('hidden-test');
    expect(JSON.stringify(result)).not.toContain('hidden-run');
    expect(result?.readEligibility.state).toBe('restricted');
  });
});
