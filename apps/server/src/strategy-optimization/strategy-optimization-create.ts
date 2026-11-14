import { Prisma } from '@prisma/client';
import { optimizationExperimentCreateSchema } from '@thesis-ledger/schemas';
import type { AiProviderRegistry } from '../ai/provider-registry.js';
import type { PrismaService } from '../platform/prisma.service.js';
import type { StrategyOptimizationReadService } from './strategy-optimization-read.service.js';
import type { StrategyOptimizationCandidateService } from './strategy-optimization-candidate.service.js';
import type { ExperimentRow } from './strategy-optimization-common.js';
import { buildOptimizationModelConfig } from './strategy-optimization-model-routing.js';
import {
  assertOptimizationModelConfigCost,
  optimizationCostError,
} from './strategy-optimization-cost.js';
import { assertOptimizationCreateIdentity } from './strategy-optimization-create-identity.js';
import { createDiscoveryExperiment } from './strategy-optimization-discovery-store.js';
import { insertOptimizationExperiment } from './strategy-optimization-experiment.store.js';
import { describeStrategyParameters } from './strategy-optimization-parameters.js';
import {
  requireOptimizationPriceResearch,
  requireOptimizationResearchStrategy,
} from './strategy-optimization-research.js';

export async function createOptimizationExperiment(
  input: unknown,
  dependencies: {
    prisma: PrismaService;
    providers: AiProviderRegistry;
    reads: Pick<StrategyOptimizationReadService, 'experiment' | 'formalStrategyVersion'>;
    candidates: Pick<StrategyOptimizationCandidateService, 'validateAuthorizedParameters'>;
    process: (id: string) => Promise<void>;
  },
) {
  const { prisma, providers, reads, candidates } = dependencies;
  const parsed = optimizationExperimentCreateSchema.parse(input);
  const modelConfig = buildOptimizationModelConfig(
    parsed.models,
    providers,
    parsed.sourceMode === 'discovery' ? 'strategy_discovery' : 'parameter_optimization',
  );
  assertOptimizationModelConfigCost(modelConfig);
  const previous = await prisma.$queryRaw<ExperimentRow[]>(Prisma.sql`
    SELECT * FROM "OptimizationExperiment" WHERE "idempotencyKey"=${parsed.idempotencyKey} LIMIT 1
  `);
  if (previous[0]) {
    assertOptimizationCreateIdentity(previous[0], parsed, modelConfig);
    return reads.experiment(previous[0].id);
  }
  const hasUnknownCost = modelConfig.some((route) => route.costStatus === 'unknown');
  if (hasUnknownCost && parsed.budget.maxCost !== undefined)
    throw optimizationCostError(
      'OPTIMIZATION_COST_TOTAL_LIMIT_UNAVAILABLE',
      '费用或计费币种未知时不能提交实验总金额上限',
    );
  if (hasUnknownCost && !parsed.acknowledgeUnknownCost)
    throw optimizationCostError(
      'OPTIMIZATION_COST_UNKNOWN_CONFIRMATION_REQUIRED',
      '所选模型存在未知费用；请明确确认后继续，实验总金额上限不可用',
    );
  requireOptimizationPriceResearch(parsed.runConfig);
  let created: ExperimentRow;
  if (parsed.sourceMode === 'discovery') {
    created = await createDiscoveryExperiment(prisma, parsed, modelConfig);
  } else {
    const baseline = await reads.formalStrategyVersion(parsed.strategyVersionId!);
    requireOptimizationResearchStrategy(baseline.strategy);
    const descriptors = describeStrategyParameters(baseline.strategy);
    candidates.validateAuthorizedParameters(descriptors, parsed.allowedParameterIds!);
    created = await insertOptimizationExperiment(prisma, parsed, baseline, modelConfig);
  }
  void dependencies.process(created.id).catch(() => undefined);
  return reads.experiment(created.id);
}
