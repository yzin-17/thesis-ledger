import { Prisma } from '@prisma/client';
import type { StrategyParameterDescriptor, StrategySchemaV2 } from '@thesis-ledger/schemas';
import type { PrismaService } from '../platform/prisma.service.js';
import type { ExperimentRow } from './strategy-optimization-common.js';
import {
  discoveryGenerationPrompt,
  discoveryPrompt,
} from './strategy-optimization-discovery.js';

const priorFeedback = async (
  prisma: PrismaService,
  experimentId: string,
  modelKey: string,
) => {
  const rows = await prisma.$queryRaw<Array<{ diff: unknown; metrics: unknown }>>(Prisma.sql`
    SELECT "diff", "metrics" FROM "OptimizationCandidate"
    WHERE "experimentId"=${experimentId}::uuid AND "modelKey"=${modelKey}
    ORDER BY "candidateNumber" DESC LIMIT 3
  `);
  return rows.map((row) => ({ diff: row.diff, metrics: row.metrics }));
};

export const strategyOptimizationPrompt = async (input: {
  prisma: PrismaService;
  experiment: ExperimentRow;
  strategy: StrategySchemaV2;
  descriptors: StrategyParameterDescriptor[];
  modelKey: string;
  round: number;
  useSdkContract: boolean;
}) => {
  const priorCandidates = await priorFeedback(
    input.prisma,
    input.experiment.id,
    input.modelKey,
  );
  if (input.experiment.sourceMode === 'discovery')
    return input.useSdkContract
      ? discoveryGenerationPrompt(
          input.experiment,
          input.strategy,
          input.round,
          priorCandidates,
        )
      : discoveryPrompt(input.experiment, input.strategy, input.round, priorCandidates);
  const allowed = new Set(input.experiment.allowedParameterIds as string[]);
  const authorized = input.descriptors.filter((item) => allowed.has(item.parameterId));
  return [
    {
      role: 'system' as const,
      content:
        '你是策略参数优化器。只能修改允许的 parameterId；不得修改数据、执行语义或生成代码。只输出 OptimizationProposal JSON。不得声明收益率或回测结果，真实结果以服务端回测为准。',
    },
    {
      role: 'user' as const,
      content: `OPTIMIZATION_REQUEST_JSON:${JSON.stringify({
        semanticVersion: 'strategy-optimization-v1',
        modelKey: input.modelKey,
        round: input.round,
        objective: input.experiment.objective,
        authorizedParameters: authorized,
        baselineMetrics: input.experiment.baselineMetrics,
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
