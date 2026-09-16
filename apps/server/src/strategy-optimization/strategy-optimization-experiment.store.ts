import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import type { OptimizationExperimentCreate, StrategySchemaV2 } from '@thesis-ledger/schemas';
import type { PrismaService } from '../platform/prisma.service.js';
import {
  optimizationSha256,
  type ExperimentRow,
  type StrategyVersionRecord,
} from './strategy-optimization-common.js';
import { STRATEGY_SPACE_VERSION } from './strategy-optimization-discovery.js';
import type { OptimizationModelConfig } from './strategy-optimization-model-routing.js';

export async function insertOptimizationExperiment(
  prisma: Prisma.TransactionClient | PrismaService,
  parsed: OptimizationExperimentCreate,
  baseline: StrategyVersionRecord & { strategy: StrategySchemaV2 },
  modelConfig: OptimizationModelConfig[],
) {
  const id = randomUUID();
  const dataFingerprint = optimizationSha256({
    schema: baseline.strategy,
    runConfig: parsed.runConfig,
    split: parsed.split,
    semanticVersion: 'strategy-optimization-v1',
  });
  const rows = await prisma.$queryRaw<ExperimentRow[]>(Prisma.sql`
    INSERT INTO "OptimizationExperiment" (
      "id", "sourceMode", "discoveryScope", "strategySpaceVersion", "baselineStrategyVersionId", "status", "stage", "objective", "allowedParameterIds",
      "split", "runConfig", "dataFingerprint", "modelConfig", "budget", "maxRounds", "idempotencyKey", "updatedAt"
    ) VALUES (
      ${id}::uuid, ${parsed.sourceMode}, ${parsed.discoveryScope ? JSON.stringify(parsed.discoveryScope) : null}::jsonb,
      ${parsed.sourceMode === 'discovery' ? STRATEGY_SPACE_VERSION : null}, ${baseline.id}::uuid, 'queued', 'preparing', ${JSON.stringify(parsed.objective)}::jsonb,
      ${JSON.stringify(parsed.allowedParameterIds ?? [])}::jsonb, ${JSON.stringify(parsed.split)}::jsonb,
      ${JSON.stringify(parsed.runConfig)}::jsonb, ${dataFingerprint}, ${JSON.stringify(modelConfig)}::jsonb,
      ${JSON.stringify(parsed.budget)}::jsonb, ${parsed.maxRounds}, ${parsed.idempotencyKey}, CURRENT_TIMESTAMP
    ) RETURNING *
  `);
  return rows[0]!;
}
