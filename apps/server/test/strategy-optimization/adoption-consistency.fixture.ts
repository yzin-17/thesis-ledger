import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import type { PrismaService } from '../../src/platform/prisma.service.js';
import { ResultReadPolicyService } from '../../src/platform/result-read-policy.service.js';
import { createDiscoverySeed } from '../../src/strategy-optimization/strategy-optimization-discovery.js';
import { optimizationSha256 } from '../../src/strategy-optimization/strategy-optimization-common.js';
import { StrategyOptimizationService } from '../../src/strategy-optimization/strategy-optimization.service.js';
import { StrategyOptimizationReadService } from '../../src/strategy-optimization/strategy-optimization-read.service.js';
import { StrategyRiskApplicationService } from '../../src/strategy-optimization/strategy-risk-application.service.js';
import { StrategyRiskApplicationStoreService } from '../../src/strategy-optimization/strategy-risk-application-store.service.js';

export async function adoptionFixture(prisma: PrismaService) {
  const schema = createDiscoverySeed({ executionInstrument: { symbol: '00700.HK', market: 'HK', assetType: 'stock' }, primaryTimeframe: '1d' }, true);
  schema.risk.push({ type: 'fixedStop', percent: '0.03' });
  const strategy = await prisma.strategy.create({ data: { name: '隔离采纳一致性', status: 'draft', schemaVersion: 3 } });
  const baseline = await prisma.strategyVersion.create({ data: { strategyId: strategy.id, version: 1, schemaVersion: 3, schema: schema as Prisma.InputJsonValue } });
  const candidateVersion = await prisma.strategyVersion.create({ data: { strategyId: strategy.id, version: -1, schemaVersion: 3, schema: schema as Prisma.InputJsonValue } });
  const id = randomUUID(), candidateId = randomUUID(), hash = optimizationSha256(schema);
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "OptimizationExperiment" ("id", "sourceMode", "baselineStrategyVersionId", "status", "stage", "objective", "allowedParameterIds", "split", "runConfig", "dataFingerprint", "modelConfig", "budget", "maxRounds", "exposure", "idempotencyKey")
    VALUES (${id}::uuid, 'existing', ${baseline.id}::uuid, 'succeeded', 'completed', '{}'::jsonb, '[]'::jsonb, '{}'::jsonb, '{}'::jsonb, 'isolated-consistency', '[]'::jsonb, '{}'::jsonb, 1, '{"testRevealed":true}'::jsonb, ${randomUUID()})
  `);
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "OptimizationCandidate" ("id", "experimentId", "candidateNumber", "modelKey", "candidateStrategyVersionId", "executionHash", "proposal", "diff", "validationStatus", "runRefs", "metrics")
    VALUES (${candidateId}::uuid, ${id}::uuid, 1, 'isolated-consistency', ${candidateVersion.id}::uuid, ${hash}, '{}'::jsonb, '[]'::jsonb, 'test_valid', '{}'::jsonb, '{}'::jsonb)
  `);
  return { id, candidateId, schema, strategy, input: { candidateId, candidateHash: hash, expectedStrategyVersion: 1, idempotencyKey: randomUUID() } };
}

export function adoptionServices(prisma: PrismaService, commandDatabase = prisma) {
  const reads = new StrategyOptimizationReadService(prisma, { list: () => [] } as never, new ResultReadPolicyService(prisma));
  const risk = new StrategyRiskApplicationService(prisma, {} as never, new StrategyRiskApplicationStoreService(prisma), {} as never);
  const service = new StrategyOptimizationService(commandDatabase, {} as never, {} as never, reads, {} as never, risk);
  return { service, reads, risk };
}

export function publicationProbe(prisma: PrismaService, strategyId: string, hooks: {
  beforeLock?: () => void;
  afterLock?: () => Promise<void>;
}) {
  return new Proxy(prisma, { get(target, key) {
    if (key !== '$transaction') return Reflect.get(target, key);
    return (callback: (tx: Prisma.TransactionClient) => Promise<unknown>) => target.$transaction(async transaction => {
      const proxy = new Proxy(transaction, { get(inner, prop) {
        if (prop !== '$executeRaw') return Reflect.get(inner, prop);
        return async (query: Prisma.Sql) => {
          const publicationLock = query.strings.join('').includes('pg_advisory_xact_lock') && query.values.includes(strategyId);
          if (publicationLock) hooks.beforeLock?.();
          const result = await inner.$executeRaw(query);
          if (publicationLock) await hooks.afterLock?.();
          return result;
        };
      } });
      return callback(proxy);
    });
  } });
}
