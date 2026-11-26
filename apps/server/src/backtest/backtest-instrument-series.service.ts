import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import {
  backtestInstrumentSeriesSchema,
  backtestSnapshotManifestV3Schema,
  decimalStringSchema,
  marketCalendarTimezonesV3,
  runConfigSchemaV3,
  type BacktestInstrumentSeries,
  type BacktestSnapshotManifestV3,
  type RunConfigV3,
} from '@thesis-ledger/schemas';
import { BacktestService } from './backtest.service.js';
import { LocalSnapshotStore } from './backtest-snapshot.js';
import type { ArtifactRow } from './backtest-artifact-store.js';
import { ArtifactNotFoundError } from './backtest-artifact-store.js';
import { isBacktestEvidenceAfterDataAsOfV3 } from './backtest-v3-evidence-clock.js';
import { stockSnapshotStoreForJob } from './backtest-v3-run-execution.js';

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
type UnavailableReason = Extract<BacktestInstrumentSeries, { status: 'unavailable' }>['reason'];
const timestampSchema = z.iso.datetime({ offset: true });
const unavailable = (
  runId: string,
  reason: UnavailableReason,
  message: string,
): Extract<BacktestInstrumentSeries, { status: 'unavailable' }> => ({
  schemaVersion: '1',
  runId,
  status: 'unavailable',
  reason,
  message,
});

@Injectable()
export class BacktestInstrumentSeriesService {
  constructor(
    private readonly backtests: BacktestService,
    private readonly snapshots: LocalSnapshotStore,
  ) {}

  async read(runId: string): Promise<BacktestInstrumentSeries> {
    const job = await this.backtests.currentRunForRead(runId);
    if (!job) throw new NotFoundException('回测任务不存在');
    if (record(job.readEligibility).state !== 'readable')
      throw new ForbiddenException({
        code: 'RESULT_RESTRICTED',
        message: '回测结果尚未允许读取。',
      });
    if (!job.result)
      return unavailable(runId, 'NOT_READY', '回测结果尚未就绪，暂不能展示标的走势。');
    const manifestResult = backtestSnapshotManifestV3Schema.safeParse(job.snapshotManifest);
    const configResult = runConfigSchemaV3.safeParse(job.runConfig);
    if (!manifestResult.success || !configResult.success)
      return unavailable(runId, 'SNAPSHOT_UNAVAILABLE', '本次回测没有可读取的冻结行情快照。');
    const manifest = manifestResult.data;
    const config = configResult.data;
    const source = manifest.actualSources.find((entry) => entry.purpose === 'execution');
    if (!source || source.routeKey.kind !== 'bar')
      return unavailable(runId, 'EXECUTION_PRICE_UNAVAILABLE', '本次快照没有冻结的标的执行行情。');
    const routeKey = source.routeKey;
    const artifact = manifest.artifacts.find(
      (entry) => entry.key === `${runId}/execution/bars.parquet`,
    );
    if (!artifact)
      return unavailable(runId, 'ARTIFACT_UNAVAILABLE', '本次回测的冻结价格产物缺失。');
    const timezone =
      config.executionModel?.scope.timezone ?? marketCalendarTimezonesV3[routeKey.market];
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const dateKey = (timestamp: string) => {
      const parts = formatter.formatToParts(new Date(timestamp));
      const part = (type: string) => parts.find((entry) => entry.type === type)?.value;
      return `${part('year')}-${part('month')}-${part('day')}`;
    };
    const points = await this.readFrozenSeriesPoints(
      runId,
      artifact,
      source,
      routeKey,
      manifest.dataAsOf,
      config,
      dateKey,
      stockSnapshotStoreForJob({ id: runId, input: job.input, executionAttempt: job.executionAttempt }, this.snapshots).artifacts,
    );
    if (!Array.isArray(points)) return points;
    if (!points.some((point) => point.close !== null))
      return unavailable(runId, 'EMPTY_SERIES', '回测区间没有可绘制的冻结标的价格。');
    points.sort((left, right) => Date.parse(left.occurredAt) - Date.parse(right.occurredAt));
    return backtestInstrumentSeriesSchema.parse({
      schemaVersion: '1',
      runId,
      status: 'available',
      source: {
        symbol: source.symbol,
        currency: config.executionModel?.scope.currency ?? null,
        adjustment: routeKey.adjustment,
        timeframe: routeKey.timeframe,
        timezone,
        providerId: source.provenance.providerId,
        upstreamSource: source.provenance.upstreamSource,
        snapshotId: manifest.contentHash,
        dataAsOf: manifest.dataAsOf,
        artifactHash: artifact.contentHash,
      },
      points,
    });
  }
  private async readFrozenSeriesPoints(
    runId: string,
    artifact: BacktestSnapshotManifestV3['artifacts'][number],
    source: ExecutionSource,
    routeKey: ExecutionBarRoute,
    dataAsOf: string,
    config: RunConfigV3,
    dateKey: (timestamp: string) => string,
    artifacts: LocalSnapshotStore['artifacts'],
  ): Promise<SeriesPoint[] | Extract<BacktestInstrumentSeries, { status: 'unavailable' }>> {
    const points: SeriesPoint[] = [];
    const seen = new Set<number>();
    let count = 0;
    try {
      for await (const row of await artifacts.openRead(artifact)) {
        if (++count > 100_000)
          return unavailable(runId, 'SERIES_TOO_LARGE', '冻结标的序列超出当前展示上限。');
        if (!isFrozenExecutionBar(row, source, routeKey, dataAsOf))
          return unavailable(runId, 'INTEGRITY_ERROR', '冻结价格与本次回测的来源或口径不一致。');
        const time = Date.parse(row.occurredAt);
        if (seen.has(time))
          return unavailable(runId, 'INTEGRITY_ERROR', '冻结价格存在重复时点，无法安全展示。');
        seen.add(time);
        const date = dateKey(row.occurredAt);
        if (date < config.startDate || date > config.endDate) continue;
        const close = row.close === null ? null : String(row.close);
        if (close !== null && !decimalStringSchema.safeParse(close).success)
          return unavailable(runId, 'INTEGRITY_ERROR', '冻结收盘价无效，无法展示标的走势。');
        points.push({ occurredAt: row.occurredAt, close });
      }
    } catch (error) {
      if (error instanceof ArtifactNotFoundError)
        return unavailable(runId, 'ARTIFACT_UNAVAILABLE', '本次回测的冻结价格文件不可读取。');
      return unavailable(runId, 'INTEGRITY_ERROR', '本次回测的冻结价格校验或读取失败。');
    }

    return points;
  }
}

type SeriesPoint = { occurredAt: string; close: string | null };
type ExecutionSource = BacktestSnapshotManifestV3['actualSources'][number];
type ExecutionBarRoute = Extract<ExecutionSource['routeKey'], { kind: 'bar' }>;

function isFrozenExecutionBar(
  row: ArtifactRow,
  source: ExecutionSource,
  routeKey: ExecutionBarRoute,
  dataAsOf: string,
): row is ArtifactRow & { occurredAt: string } {
  return !(
    row.kind !== 'market-bar-v3' ||
    row.purpose !== 'execution' ||
    row.symbol !== source.symbol ||
    row.completionStatus !== 'complete' ||
    row.quality !== 'complete' ||
    row.market !== routeKey.market ||
    row.assetType !== routeKey.assetType ||
    row.timeframe !== routeKey.timeframe ||
    row.adjustment !== routeKey.adjustment ||
    row.providerId !== source.provenance.providerId ||
    row.upstreamSource !== source.provenance.upstreamSource ||
    row.routeIndex !== source.provenance.routeIndex ||
    row.effectivePolicyRevision !== source.provenance.effectivePolicyRevision ||
    row.inputFingerprint !== source.inputFingerprint ||
    typeof row.occurredAt !== 'string' ||
    !timestampSchema.safeParse(row.occurredAt).success ||
    typeof row.availableAt !== 'string' ||
    !timestampSchema.safeParse(row.availableAt).success ||
    isBacktestEvidenceAfterDataAsOfV3(row.occurredAt, dataAsOf) ||
    isBacktestEvidenceAfterDataAsOfV3(row.availableAt, dataAsOf)
  );
}
