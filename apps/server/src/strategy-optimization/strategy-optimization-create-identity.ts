import { ConflictException } from '@nestjs/common';
import type { OptimizationExperimentCreate } from '@thesis-ledger/schemas';
import { optimizationSha256, type ExperimentRow } from './strategy-optimization-common.js';
import {
  optimizationCostError,
  sameOptimizationCostConfirmation,
} from './strategy-optimization-cost.js';

type StoredCreateIdentity = Pick<
  ExperimentRow,
  | 'sourceMode'
  | 'baselineStrategyVersionId'
  | 'discoveryScope'
  | 'allowedParameterIds'
  | 'objective'
  | 'split'
  | 'runConfig'
  | 'modelConfig'
  | 'budget'
  | 'maxRounds'
>;

export function assertOptimizationCreateIdentity(
  previous: StoredCreateIdentity,
  request: OptimizationExperimentCreate,
  modelConfig: unknown,
) {
  if (
    !sameOptimizationCostConfirmation(previous, {
      modelConfig,
      budget: request.budget,
      maxRounds: request.maxRounds,
    })
  )
    throw optimizationCostError(
      'OPTIMIZATION_COST_CONFIRMATION_STALE',
      '模型路线或费用预算已变化，不能复用旧费用确认；请重新创建实验',
    );
  const stored = {
    sourceMode: previous.sourceMode,
    strategyVersionId:
      previous.sourceMode === 'existing' ? previous.baselineStrategyVersionId : null,
    discoveryScope: previous.sourceMode === 'discovery' ? previous.discoveryScope : null,
    allowedParameterIds: previous.sourceMode === 'existing' ? previous.allowedParameterIds : [],
    objective: previous.objective,
    split: previous.split,
    runConfig: previous.runConfig,
  };
  const current = {
    sourceMode: request.sourceMode,
    strategyVersionId: request.sourceMode === 'existing' ? request.strategyVersionId : null,
    discoveryScope: request.sourceMode === 'discovery' ? request.discoveryScope : null,
    allowedParameterIds: request.sourceMode === 'existing' ? request.allowedParameterIds : [],
    objective: request.objective,
    split: request.split,
    runConfig: request.runConfig,
  };
  if (optimizationSha256(stored) !== optimizationSha256(current))
    throw new ConflictException({
      code: 'IDEMPOTENCY_KEY_CONFLICT',
      message: '提交意图已用于不同实验配置，请保留原配置重试或新建实验',
    });
}
