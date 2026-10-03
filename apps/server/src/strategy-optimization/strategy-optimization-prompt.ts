import { Prisma } from '@prisma/client';
import {
  optimizationObjectiveSchema,
  optimizationDiscoveryScopeSchema,
  type StrategyParameterDescriptor,
  type BacktestStrategy,
} from '@thesis-ledger/schemas';
import type { PrismaService } from '../platform/prisma.service.js';
import type { ExperimentRow } from './strategy-optimization-common.js';
import { discoveryGenerationPrompt, discoveryPrompt } from './strategy-optimization-discovery.js';
import {
  optimizationModelDiff,
  optimizationModelMetrics,
  optimizationModelResearchNotice,
} from './strategy-optimization-model-feedback.js';

const priorFeedback = async (prisma: PrismaService, experimentId: string, modelKey: string) => {
  const rows = await prisma.$queryRaw<Array<{ diff: unknown; metrics: unknown }>>(Prisma.sql`
    SELECT "diff", "metrics" FROM "OptimizationCandidate"
    WHERE "experimentId"=${experimentId}::uuid AND "modelKey"=${modelKey}
    ORDER BY "candidateNumber" DESC LIMIT 3
  `);
  return rows;
};

export const strategyOptimizationPrompt = async (input: {
  prisma: PrismaService;
  experiment: ExperimentRow;
  strategy: BacktestStrategy;
  descriptors: StrategyParameterDescriptor[];
  modelKey: string;
  round: number;
  useSdkContract: boolean;
}) => {
  const priorRows = await priorFeedback(input.prisma, input.experiment.id, input.modelKey);
  const allowed = new Set(input.experiment.allowedParameterIds as string[]);
  const authorized = input.descriptors.filter((item) => allowed.has(item.parameterId));
  const priorCandidates = priorRows.map((row) => ({
    diff: optimizationModelDiff(row.diff, authorized, input.experiment.sourceMode === 'discovery'),
    metrics: optimizationModelMetrics(row.metrics),
  }));
  const notice = optimizationModelResearchNotice(input.experiment.runConfig);
  const objective = optimizationObjectiveSchema.parse(input.experiment.objective);
  if (input.experiment.sourceMode === 'discovery')
    return (
      input.useSdkContract
        ? discoveryGenerationPrompt(
            {
              ...input.experiment,
              objective,
              discoveryScope: optimizationDiscoveryScopeSchema.parse(
                input.experiment.discoveryScope,
              ),
            },
            input.strategy,
            input.round,
            priorCandidates,
          )
        : discoveryPrompt(
            {
              ...input.experiment,
              objective,
              discoveryScope: optimizationDiscoveryScopeSchema.parse(
                input.experiment.discoveryScope,
              ),
            },
            input.strategy,
            input.round,
            priorCandidates,
          )
    ).map((message, index) =>
      index === 0 ? { ...message, content: `${message.content}\n${notice}` } : message,
    );
  return [
    {
      role: 'system' as const,
      content:
        '你是策略参数优化器。只能修改允许的 parameterId；不得修改数据、执行语义或生成代码。只输出 OptimizationProposal JSON。不得声明收益率或回测结果，真实结果以服务端回测为准。' +
        notice,
    },
    {
      role: 'user' as const,
      content: `OPTIMIZATION_REQUEST_JSON:${JSON.stringify({
        semanticVersion: 'strategy-optimization-v1',
        modelKey: input.modelKey,
        round: input.round,
        objective,
        authorizedParameters: authorized,
        baselineMetrics: optimizationModelMetrics(input.experiment.baselineMetrics),
        priorCandidates,
        strategy: {
          name: input.strategy.name,
          primaryTimeframe: input.strategy.primaryTimeframe,
          executionInstrument: input.strategy.executionInstrument,
        },
      })}`,
    },
  ];
};
