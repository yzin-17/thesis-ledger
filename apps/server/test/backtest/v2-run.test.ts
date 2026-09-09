import { describe, expect, it, vi } from 'vitest';
import { strategySchemaV2, runConfigSchemaV2, type StrategySchemaV2 } from '@thesis-ledger/schemas';
import { BacktestService } from '../../src/backtest/backtest.service.js';
import { BacktestV2RunService } from '../../src/backtest/backtest-v2-run.js';
import { buildSnapshotManifest, finalizeSnapshotManifest } from '../../src/backtest/backtest-snapshot.js';

const strategy = strategySchemaV2.parse({
  schemaVersion: '2',
  name: 'server v2',
  signalSources: [
    { id: 'close', asset: { symbol: '600519.SH', market: 'CN', assetType: 'stock' }, timeframe: '1d', series: ['close'] },
  ],
  executionInstrument: { symbol: '600519.SH', market: 'CN', assetType: 'stock' },
  primaryTimeframe: '1d',
  entry: { type: 'compare', operator: 'gt', left: { type: 'series', sourceId: 'close', field: 'close' }, right: { type: 'constant', value: '1' } },
  exit: { type: 'positionState', field: 'isOpen' },
  sizing: { type: 'fixedQuantity', quantity: '1' },
  risk: [],
  execution: { mode: 'exchange', orderType: 'market', timeInForce: 'DAY', timing: 'nextEligibleBarOpen' },
  cost: { commissionRate: '0', slippageRate: '0' },
}) as StrategySchemaV2;

const runConfig = runConfigSchemaV2.parse({
  startDate: '2025-01-01',
  endDate: '2025-01-03',
  dataAsOf: '2025-01-04T00:00:00Z',
  baseCurrency: 'CNY',
  initialCash: { CNY: '10000' },
  valuationPolicy: { baseTimezone: 'Asia/Shanghai', dailyValuationTime: '15:00', pricePolicy: 'latestAvailable', fxPolicy: 'latestAvailable' },
});

const request = {
  strategyVersionId: '11111111-1111-4111-8111-111111111111',
  runConfig,
  idempotencyKey: 'v2-once',
};

function prismaFor() {
  const create = vi.fn(async ({ data }: { data: Record<string, unknown> }) => data);
  return {
    strategyVersion: { findUnique: vi.fn(async () => ({ schemaVersion: 2, schema: strategy })) },
    backtestJob: { findFirst: vi.fn(async () => null), create },
  };
}

describe('V2 Server Run boundary', () => {
  it('rejects Desktop bars and records unavailable when no Snapshot Builder is configured', async () => {
    const prisma = prismaFor();
    const service = new BacktestService(prisma as never, undefined, new BacktestV2RunService(prisma as never));
    await expect(service.createRun({ ...request, bars: [] })).rejects.toThrow();
    const result = await service.createRun(request);
    expect(result).toMatchObject({ mode: 'V2', status: 'failed', errorCode: 'DATA_UNAVAILABLE' });
    expect(prisma.backtestJob.create).toHaveBeenCalledWith({ data: expect.objectContaining({ input: expect.not.objectContaining({ bars: expect.anything() }) }) });
  });

  it('queues only a finalized snapshot with real ArtifactRefs from the builder port', async () => {
    const prisma = prismaFor();
    const builder = {
      build: vi.fn(async ({ runId, strategyVersionId, strategy: inputStrategy, runConfig: inputConfig }: { runId: string; strategyVersionId: string; strategy: StrategySchemaV2; runConfig: typeof runConfig }) => {
        const manifest = buildSnapshotManifest({ runId, strategyVersionId, strategy: inputStrategy, runConfig: inputConfig, strategyVersionHash: 'strategy-hash' });
        const artifact = { artifactId: 'artifact-1', key: `${runId}/bars.parquet`, format: 'parquet' as const, compression: 'zstd' as const, contentHash: 'artifact-hash', sizeBytes: 10 };
        const finalized = finalizeSnapshotManifest(manifest, [artifact]);
        return { manifest: finalized, snapshotRef: { snapshotId: finalized.contentHash!, contentHash: finalized.contentHash! }, artifactRefs: [artifact] };
      }),
    };
    const runs = new BacktestV2RunService(prisma as never, undefined, undefined, builder);
    const service = new BacktestService(prisma as never, undefined, runs);
    const result = await service.createRun(request);
    expect(result).toMatchObject({ mode: 'V2', status: 'queued', snapshotId: expect.any(String) });
    expect(builder.build).toHaveBeenCalledOnce();
  });
});
