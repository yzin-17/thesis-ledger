import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import type { OptimizationExperimentCreate, StrategySchemaV2 } from '@thesis-ledger/schemas';
import type { PrismaService } from '../platform/prisma.service.js';
import {
  asJson,
  defaultExperimentName,
  optimizationSha256,
  type ExperimentRow,
  type StrategyVersionRecord,
} from './strategy-optimization-common.js';
import { createDiscoverySeed, STRATEGY_SPACE_VERSION } from './strategy-optimization-discovery.js';
import type { OptimizationModelConfig } from './strategy-optimization-model-routing.js';

const insert = async (
  prisma: Prisma.TransactionClient | PrismaService,
  parsed: OptimizationExperimentCreate,
  baseline: StrategyVersionRecord & { strategy: { id: string } },
  baselineSchema: StrategySchemaV2,
  modelConfig: OptimizationModelConfig[],
  idempotencyKey: string,
) => {
  const id = randomUUID();
  const dataFingerprint = computeDiscoveryDataFingerprint(baselineSchema, parsed);
  const name =
    parsed.name ??
    defaultExperimentName({
      sourceMode: 'discovery',
      discoveryScope: parsed.discoveryScope,
    });
  const rows = await prisma.$queryRaw<ExperimentRow[]>(Prisma.sql`
    INSERT INTO "OptimizationExperiment" (
      "id", "name", "sourceMode", "discoveryScope", "strategySpaceVersion", "baselineStrategyVersionId", "status", "stage", "objective", "allowedParameterIds",
      "split", "runConfig", "dataFingerprint", "modelConfig", "budget", "maxRounds", "idempotencyKey", "updatedAt"
    ) VALUES (
      ${id}::uuid, ${name}, 'discovery', ${JSON.stringify(parsed.discoveryScope)}::jsonb, ${STRATEGY_SPACE_VERSION}, ${baseline.id}::uuid, 'queued', 'preparing', ${JSON.stringify(parsed.objective)}::jsonb,
      '[]'::jsonb, ${JSON.stringify(parsed.split)}::jsonb, ${JSON.stringify(parsed.runConfig)}::jsonb, ${dataFingerprint}, ${JSON.stringify(modelConfig)}::jsonb,
      ${JSON.stringify(parsed.budget)}::jsonb, ${parsed.maxRounds}, ${idempotencyKey}, CURRENT_TIMESTAMP
    ) RETURNING *
  `);
  return rows[0]!;
};

export const computeDiscoveryDataFingerprint = (
  schema: StrategySchemaV2,
  parsed: { runConfig: unknown; split: unknown },
) =>
  optimizationSha256({
    schema,
    runConfig: parsed.runConfig,
    split: parsed.split,
    semanticVersion: 'strategy-optimization-v1',
  });

export async function createDiscoveryExperiment(
  prisma: PrismaService,
  parsed: OptimizationExperimentCreate,
  modelConfig: OptimizationModelConfig[],
) {
  return prisma.$transaction(async (transaction) => {
    const scope = parsed.discoveryScope!;
    const strategy = await transaction.strategy.create({
      data: {
        name: `AI 探索种子 ${scope.executionInstrument.symbol}`,
        description: '实验专用隐藏策略，不进入策略库。',
        status: 'experiment-only',
        schemaVersion: 2,
      },
    });
    const seed = createDiscoverySeed(scope);
    const version = await transaction.strategyVersion.create({
      data: {
        strategyId: strategy.id,
        version: 0,
        schemaVersion: 2,
        schema: asJson(seed),
      },
    });
    return insert(
      transaction,
      parsed,
      { ...version, strategy },
      seed,
      modelConfig,
      parsed.idempotencyKey,
    );
  });
}

export async function cloneDiscoveryExperiment(
  prisma: PrismaService,
  source: ExperimentRow,
  cloneId: string,
  idempotencyKey: string,
  exposure: unknown,
  name?: string,
) {
  const scope = source.discoveryScope as OptimizationExperimentCreate['discoveryScope'];
  return prisma.$transaction(async (transaction) => {
    const strategy = await transaction.strategy.create({
      data: {
        name: `AI 探索种子 ${scope!.executionInstrument.symbol}`,
        description: '实验专用隐藏策略，不进入策略库。',
        status: 'experiment-only',
        schemaVersion: 2,
      },
    });
    const seed = createDiscoverySeed(scope!);
    const version = await transaction.strategyVersion.create({
      data: {
        strategyId: strategy.id,
        version: 0,
        schemaVersion: 2,
        schema: asJson(seed),
      },
    });
    const experimentName =
      name ??
      source.name ??
      defaultExperimentName({ sourceMode: 'discovery', discoveryScope: scope });
    const dataFingerprint = computeDiscoveryDataFingerprint(seed, source);
    const rows = await transaction.$queryRaw<ExperimentRow[]>(Prisma.sql`
      INSERT INTO "OptimizationExperiment" (
        "id", "name", "sourceMode", "discoveryScope", "strategySpaceVersion", "baselineStrategyVersionId", "status", "stage", "objective", "allowedParameterIds",
        "split", "runConfig", "dataFingerprint", "modelConfig", "budget", "maxRounds", "idempotencyKey", "testExposedAt", "exposure", "updatedAt"
      ) VALUES (
        ${cloneId}::uuid, ${experimentName}, 'discovery', ${JSON.stringify(source.discoveryScope)}::jsonb, ${source.strategySpaceVersion}, ${version.id}::uuid, 'queued', 'preparing',
        ${JSON.stringify(source.objective)}::jsonb, ${JSON.stringify(source.allowedParameterIds)}::jsonb, ${JSON.stringify(source.split)}::jsonb,
        ${JSON.stringify(source.runConfig)}::jsonb, ${dataFingerprint}, ${JSON.stringify(source.modelConfig)}::jsonb,
        ${JSON.stringify(source.budget)}::jsonb, ${source.maxRounds}, ${idempotencyKey}, ${source.testExposedAt}, ${JSON.stringify(exposure)}::jsonb, CURRENT_TIMESTAMP
      ) RETURNING *
    `);
    return rows[0];
  });
}
