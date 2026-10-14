import type { PrismaService } from '../../src/platform/prisma.service.js';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { deterministicResultChecksum } from '@thesis-ledger/domain';
import {
  backtestResultSchemaV3,
  backtestSnapshotManifestV3Schema,
  runConfigSchemaV3,
} from '@thesis-ledger/schemas';
import { assertCurrentRunForRead } from '../../src/backtest/backtest-current-run-read.js';
import { hashCanonicalManifest } from '../../src/backtest/backtest-snapshot.js';

const template = backtestSnapshotManifestV3Schema.parse(
  JSON.parse(
    readFileSync(
      new URL(
        '../../../../packages/schemas/fixtures/backtest-snapshot-v3.manifest.json',
        import.meta.url,
      ),
      'utf8',
    ),
  ),
);

/** 回测边界提供现行冻结合同；优化服务、数据库和读取门禁均实际执行。 */
function completedRun(input: {
  strategyVersionId: string;
  idempotencyKey: string;
  runConfig: unknown;
}) {
  const id = randomUUID();
  const config = runConfigSchemaV3.parse(input.runConfig);
  const model = config.executionModel!;
  const modelHash = hashCanonicalManifest(model);
  const manifest = backtestSnapshotManifestV3Schema.parse({
    ...structuredClone(template),
    runId: id,
    strategyVersionId: input.strategyVersionId,
    runConfigChecksum: hashCanonicalManifest(config),
    dataAsOf: config.dataAsOf,
    dateRange: {
      startDate: config.startDate,
      endDate: config.endDate,
      warmupStartDate: config.startDate,
    },
    executionPriceProtocol: config.executionPriceProtocol,
    executionModel: {
      schemaVersion: 'execution-model-v1',
      id: model.id,
      version: model.version,
      contentHash: modelHash,
      artifactKey: 'execution-model.json',
    },
  });
  manifest.contentHash = hashCanonicalManifest(manifest);
  const payload = backtestResultSchemaV3.parse({
    source: 'BACKTEST',
    runId: id,
    strategyVersionId: input.strategyVersionId,
    snapshotId: manifest.contentHash,
    engineVersion: 'postgres-e2e-engine',
    schemaVersion: '3',
    snapshotVersion: manifest.manifestVersion,
    marketRuleVersion: manifest.marketRuleVersion,
    calendarVersion: manifest.calendarVersion,
    aggregationVersion: manifest.aggregationVersion,
    contentHash: manifest.contentHash,
    resultChecksum: 'a'.repeat(64),
    completeness: 'complete',
    executionPriceProtocol: manifest.executionPriceProtocol,
    executionModelDisclosure: { model, contentHash: modelHash },
    comparableDataFingerprint: manifest.comparableDataFingerprint,
    actualSources: manifest.actualSources,
    warnings: [],
    rejectedOrders: [],
    simulationFills: [],
    trades: [],
    equityCurve: [],
    metrics: {
      totalReturn: { status: 'available', value: '0.10' },
      maxDrawdown: { status: 'available', value: '-0.02' },
      turnover: { status: 'available', value: '0.01' },
    },
  });
  const { resultChecksum: placeholder, ...facts } = payload;
  void placeholder;
  const result = { ...facts, resultChecksum: deterministicResultChecksum(facts) };
  const job = {
    id,
    strategyVersionId: input.strategyVersionId,
    mode: 'V3',
    status: 'succeeded',
    errorCode: null,
    errorSummary: null,
    input: {
      contractVersion: 3,
      schemaVersion: '3',
      runConfig: config,
      snapshotId: manifest.contentHash,
      snapshotVersion: manifest.manifestVersion,
    },
    runConfig: config,
    snapshotId: manifest.contentHash,
    snapshotManifest: manifest,
    resultChecksum: result.resultChecksum,
    result,
  };
  assertCurrentRunForRead(job);
  return job;
}

export function createPostgresOptimizationBacktests(prisma: PrismaService) {
  const jobs = new Map<string, ReturnType<typeof completedRun>>();
  const read = async (id: string) => [...jobs.values()].find((job) => job.id === id) ?? null;
  return {
    createRun: async (input: Parameters<typeof completedRun>[0]) => {
      const previous = jobs.get(input.idempotencyKey);
      if (previous) return previous;
      const job = completedRun(input);
      await prisma.backtestJob.create({
        data: {
          ...job,
          idempotencyKey: input.idempotencyKey,
          periodStart: new Date(job.runConfig.startDate),
          periodEnd: new Date(job.runConfig.endDate),
          dataAsOf: new Date(job.runConfig.dataAsOf),
          input: JSON.parse(JSON.stringify(job.input)),
          runConfig: JSON.parse(JSON.stringify(job.runConfig)),
          snapshotManifest: JSON.parse(JSON.stringify(job.snapshotManifest)),
          result: JSON.parse(JSON.stringify(job.result)),
        },
      });
      jobs.set(input.idempotencyKey, job);
      return job;
    },
    status: read,
    statusForRead: read,
    retryRun: read,
    runCurrentRunForRead: async () => undefined,
    comparableDataFingerprint: async () => template.comparableDataFingerprint!,
  };
}
