import {
  backtestResultSchemaV2,
  runConfigSchemaV2,
  strategySchemaV2,
  type StrategySchemaV2,
} from '@thesis-ledger/schemas';
import { deterministicResultChecksum } from '@thesis-ledger/domain';
import type { BacktestV2Runner } from './backtest-v2-run.js';
import { type LocalSnapshotStore } from './backtest-snapshot.js';
import type { ArtifactRef, ArtifactRow } from './backtest-artifact-store.js';
import { runCnNavVertical, runExchangeVertical } from './backtest-v2-execution.js';

const asStrategy = (value: unknown): StrategySchemaV2 => {
  const parsed = strategySchemaV2.parse(value);
  return {
    ...parsed,
    entry: parsed.entry as StrategySchemaV2['entry'],
    exit: parsed.exit as StrategySchemaV2['exit'],
    execution: parsed.execution as StrategySchemaV2['execution'],
  };
};

const rowsFor = async (store: LocalSnapshotStore, ref: ArtifactRef): Promise<ArtifactRow[]> => {
  const rows: ArtifactRow[] = [];
  for await (const row of await store.artifacts.openRead(ref)) rows.push(row);
  return rows;
};

export class LocalSnapshotRunner implements BacktestV2Runner {
  readonly id = 'thesis-ledger-v2-local-runner';

  constructor(private readonly snapshots: LocalSnapshotStore) {}

  async run(input: Parameters<BacktestV2Runner['run']>[0], signal: AbortSignal) {
    if (signal.aborted) throw new Error('回测已取消');
    const manifest = await this.snapshots.retry(input.runId);
    if (
      manifest.contentHash !== input.snapshotRef.contentHash ||
      input.snapshotRef.snapshotId !== manifest.contentHash
    ) {
      throw new Error('Snapshot contentHash 不匹配');
    }
    const expected = new Map(
      manifest.artifacts.map((artifact) => [artifact.key, artifact.contentHash]),
    );
    for (const artifact of input.artifactRefs) {
      if (expected.get(artifact.key) !== artifact.contentHash)
        throw new Error(`ArtifactRef 不属于 finalized Snapshot: ${artifact.key}`);
    }
    const rowsByArtifact = new Map<string, ArtifactRow[]>();
    for (const artifact of input.artifactRefs) {
      if (signal.aborted) throw new Error('回测已取消');
      rowsByArtifact.set(artifact.key, await rowsFor(this.snapshots, artifact));
    }
    const metadataRef = input.artifactRefs.find((artifact) =>
      rowsByArtifact.get(artifact.key)?.some((row) => row.kind === 'snapshot-metadata'),
    );
    const metadata =
      metadataRef &&
      rowsByArtifact.get(metadataRef.key)?.find((row) => row.kind === 'snapshot-metadata');
    if (
      !metadata ||
      typeof metadata.strategy !== 'string' ||
      typeof metadata.runConfig !== 'string'
    )
      throw new Error('Snapshot metadata artifact 缺失');
    const strategy = asStrategy(JSON.parse(metadata.strategy));
    const runConfig = runConfigSchemaV2.parse(JSON.parse(metadata.runConfig));
    const vertical = (strategy.execution.mode === 'nav' ? runCnNavVertical : runExchangeVertical)({
      runId: input.runId,
      strategyVersionId: manifest.strategyVersionId,
      snapshotId: manifest.contentHash,
      strategy,
      runConfig,
      rows: rowsByArtifact,
      artifacts: input.artifactRefs,
      engineVersion: this.id,
      marketRuleVersion: manifest.marketRuleVersion,
      calendarVersion: manifest.calendarVersion,
      aggregationVersion: manifest.aggregationVersion,
    });
    const resultPayload = {
      source: 'BACKTEST' as const,
      runId: input.runId,
      strategyVersionId: manifest.strategyVersionId,
      snapshotId: manifest.contentHash,
      engineVersion: this.id,
      schemaVersion: '2' as const,
      marketRuleVersion: manifest.marketRuleVersion,
      calendarVersion: manifest.calendarVersion,
      aggregationVersion: manifest.aggregationVersion,
      contentHash: manifest.contentHash,
      completeness: vertical.analytics.completeness,
      warnings: [
        ...vertical.analytics.warnings,
        ...vertical.rejects.map((reject) => reject.reason),
      ],
      rejectedOrders: vertical.rejects.flatMap((reject) =>
        reject.orderId
          ? [
              {
                orderId: reject.orderId,
                executionSymbol: strategy.executionInstrument.symbol,
                side: 'buy' as const,
                reasonCode: reject.code,
                message: reject.reason,
                occurredAt: reject.occurredAt,
              },
            ]
          : [],
      ),
      simulationFills: vertical.fills.map((fill) => ({ ...fill, charges: fill.charges })),
      trades: vertical.trades,
      equityCurve: vertical.analytics.equityCurve,
      drawdownCurve: vertical.analytics.drawdownCurve,
      metrics: vertical.analytics.metrics,
      ...(vertical.analytics.benchmark === undefined
        ? {}
        : { benchmark: vertical.analytics.benchmark }),
    };
    return backtestResultSchemaV2.parse({
      ...resultPayload,
      resultChecksum: deterministicResultChecksum(resultPayload),
    });
  }
}
