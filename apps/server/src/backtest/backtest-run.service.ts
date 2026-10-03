import {
  BadRequestException,
  Inject,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../platform/prisma.service.js';
import { BacktestQueueService } from './backtest-queue.service.js';
import {
  canonicalizeManifest,
  hashCanonicalManifest,
  LocalSnapshotStore,
} from './backtest-snapshot.js';
import type { ArtifactRow } from './backtest-artifact-store.js';
import { runBacktestAttempt } from './backtest-run-attempt.js';
import type {
  BacktestSnapshotV3BuildInput,
  BacktestSnapshotV3BuildResult,
} from './backtest-snapshot-v3-builder.js';
import {
  BacktestSnapshotUnavailableError,
  BacktestV3RunLifecycle,
  persistedContractVersion,
} from './backtest-v3-run-lifecycle.js';
import { prepareBacktestManualRetry } from './backtest-retry-budget.js';
import {
  executeBacktestV3Run,
  loadVerifiedBacktestV3Snapshot,
} from './backtest-v3-run-execution.js';
import { BACKTEST_V3_RUNNER, type BacktestV3Runner } from './backtest-v3-runner.js';
import { BacktestCreationGuardService } from './backtest-creation-guard.service.js';
import { BacktestNavRunExecution } from './backtest-nav-run-execution.js';
import { isNavBacktestInput } from './backtest-nav-run-read.js';
import { verifyBacktestRunRetrySnapshot } from './backtest-nav-run-retry.js';
import { classifyBacktestRunFailure } from './backtest-run-failure.js';

export interface BacktestSnapshotBuilder {
  buildV3(input: BacktestSnapshotV3BuildInput): Promise<BacktestSnapshotV3BuildResult>;
}

export const BACKTEST_SNAPSHOT_BUILDER = Symbol('BACKTEST_SNAPSHOT_BUILDER');

export interface BacktestExecutionAttempt {
  attempt: number;
  maxAttempts: number;
}

export interface ComparableDataFingerprintRange {
  start: string;
  end: string;
}

const comparableDateFields = ['date', 'tradingDate', 'occurredAt', 'effectiveDate'] as const;
const comparableTimestampFields = new Set(['occurredAt', 'availableAt']);
const comparableNumberFields = new Set(['amount']);
const COMPARABLE_AMOUNT_DECIMAL_PLACES = 6;

const datePart = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value.trim());
  return match?.[1];
};

const rowDates = (row: ArtifactRow): string[] =>
  comparableDateFields.flatMap((field) => {
    const value = datePart(row[field]);
    return value ? [value] : [];
  });

const inRange = (date: string, range: ComparableDataFingerprintRange) =>
  date >= range.start && date <= range.end;

const parseJsonValue = (value: ArtifactRow['sessions']): unknown => {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
};

const stringifyJsonValue = (value: unknown): ArtifactRow['sessions'] =>
  typeof value === 'string' ? value : JSON.stringify(value);

const normalizeComparableField = (
  key: string,
  value: ArtifactRow['sessions'],
  range: ComparableDataFingerprintRange,
): ArtifactRow['sessions'] => {
  if (comparableTimestampFields.has(key) && typeof value === 'string') {
    const timestamp = Date.parse(value);
    if (Number.isFinite(timestamp)) return new Date(timestamp).toISOString();
  }
  if (comparableNumberFields.has(key) && (typeof value === 'string' || typeof value === 'number')) {
    const number = Number(value);
    if (Number.isFinite(number))
      return Number(number.toFixed(COMPARABLE_AMOUNT_DECIMAL_PLACES)).toString();
  }
  const parsed = parseJsonValue(value);
  if (key === 'range' && parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    return JSON.stringify({ start: range.start, end: range.end });
  }
  if (key === 'holidays' && Array.isArray(parsed)) {
    return stringifyJsonValue(
      parsed.filter((item) => {
        const date = datePart(item);
        return !date || inRange(date, range);
      }),
    );
  }
  if (key === 'sessionOverrides' && Array.isArray(parsed)) {
    return stringifyJsonValue(
      parsed.filter((item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return true;
        const date = datePart((item as Record<string, unknown>).date);
        return !date || inRange(date, range);
      }),
    );
  }
  return value;
};

const comparableRow = (
  row: ArtifactRow,
  range: ComparableDataFingerprintRange,
  artifactKey: string,
): ArtifactRow =>
  Object.fromEntries(
    Object.entries(row)
      .filter(
        ([key]) =>
          key !== 'inputFingerprint' &&
          !(artifactKey.startsWith('calendar/') && key === 'availableAt'),
      )
      .map(([key, value]) => [key, normalizeComparableField(key, value, range)]),
  );

const comparableRows = (
  rows: readonly ArtifactRow[],
  range: ComparableDataFingerprintRange,
  artifactKey: string,
): ArtifactRow[] =>
  rows
    .filter((row) => {
      const dates = rowDates(row);
      return dates.length === 0 || dates.some((date) => inRange(date, range));
    })
    .map((row) => comparableRow(row, range, artifactKey))
    .sort((left, right) => canonicalizeManifest(left).localeCompare(canonicalizeManifest(right)));

export class BacktestRunService {
  private readonly activeControllers = new Map<string, AbortController>();

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Optional() @Inject(BacktestQueueService) private readonly queueService?: BacktestQueueService,
    @Optional() @Inject(LocalSnapshotStore) private readonly snapshotStore?: LocalSnapshotStore,
    @Optional()
    @Inject(BACKTEST_SNAPSHOT_BUILDER)
    private readonly snapshotBuilder?: BacktestSnapshotBuilder,
    @Optional()
    @Inject(BACKTEST_V3_RUNNER)
    private readonly defaultV3Runner?: BacktestV3Runner,
    @Optional()
    @Inject(BacktestCreationGuardService)
    private readonly creationGuard?: BacktestCreationGuardService,
    @Optional()
    @Inject(BacktestNavRunExecution)
    private readonly navExecution?: BacktestNavRunExecution,
  ) {}

  private snapshotStoreForRun(): LocalSnapshotStore {
    return (
      this.snapshotStore ??
      new LocalSnapshotStore(process.env.BACKTEST_SNAPSHOT_ROOT ?? 'var/backtest')
    );
  }

  abortActiveRun(id: string): boolean {
    const controller = this.activeControllers.get(id);
    if (!controller) return false;
    controller.abort();
    return true;
  }

  async createRun(input: unknown) {
    const request =
      input !== null && typeof input === 'object' && !Array.isArray(input)
        ? (input as Record<string, unknown>)
        : undefined;
    if (request?.contractVersion !== 3) {
      throw new BadRequestException({
        code: 'UNSUPPORTED_CONTRACT_VERSION',
        message: '只支持现行回测合同',
      });
    }
    return new BacktestV3RunLifecycle(
      this.prisma,
      this.snapshotBuilder,
      this.queueService,
      this.defaultV3Runner !== undefined,
      this.creationGuard,
    ).create(input);
  }

  async runCurrent(id: string, execution?: BacktestExecutionAttempt) {
    const job = await this.prisma.backtestJob.findUnique({ where: { id } });
    if (!job) throw new NotFoundException('回测 Run 不存在');
    if (persistedContractVersion(job) !== 3)
      throw new BadRequestException('旧 Run 持久化合同拒绝执行');
    return runBacktestAttempt({
      prisma: this.prisma,
      job,
      ...(execution ? { execution } : {}),
      runnerId: isNavBacktestInput(job.input)
        ? (this.navExecution?.runner.navId ?? 'nav-runner-unconfigured')
        : (this.defaultV3Runner?.id ?? 'current-runner-unconfigured'),
      activeControllers: this.activeControllers,
      execute: async (attemptJob, signal) => {
        if (persistedContractVersion(attemptJob) !== 3)
          throw new BadRequestException('旧 Run 持久化合同拒绝执行');
        if (isNavBacktestInput(attemptJob.input)) {
          if (!this.navExecution) throw new BacktestSnapshotUnavailableError('NAV Runner 未配置');
          return this.navExecution.execute(attemptJob, signal);
        }
        if (!this.defaultV3Runner) {
          throw new BacktestSnapshotUnavailableError('现行 Runner 未配置，Run 未进入执行');
        }
        return executeBacktestV3Run({
          job: attemptJob,
          runner: this.defaultV3Runner,
          snapshots: this.snapshotStoreForRun(),
          signal,
        });
      },
      classifyFailure: (error) => classifyBacktestRunFailure(error, execution),
    });
  }

  async retryRun(id: string) {
    const job = await this.prisma.backtestJob.findUnique({ where: { id } });
    if (!job) throw new NotFoundException('回测 Run 不存在');
    if (persistedContractVersion(job) !== 3)
      throw new BadRequestException('旧 Run 持久化合同拒绝重试');
    if (job.status === 'succeeded') return job;
    if (job.status !== 'failed') throw new BadRequestException('只有 failed Run 可以 retry');
    await verifyBacktestRunRetrySnapshot({
      job,
      prisma: this.prisma,
      snapshotBuilder: this.snapshotBuilder,
      snapshotStore: this.snapshotStoreForRun(),
      queueService: this.queueService,
      navExecution: this.navExecution,
      defaultV3RunnerAvailable: this.defaultV3Runner !== undefined,
    });
    let retry: ReturnType<typeof prepareBacktestManualRetry>;
    try {
      retry = prepareBacktestManualRetry(job.input, job.executionAttempt);
    } catch {
      throw new BadRequestException('回测重试预算无效');
    }
    const changed = await this.prisma.backtestJob.updateMany({
      where: { id, mode: 'V3', status: 'failed', executionAttempt: job.executionAttempt },
      data: {
        status: 'queued',
        stage: 'queued',
        progress: 0,
        executionAttempt: retry.executionAttempt,
        input: retry.input,
        cancelRequestedAt: null,
        startedAt: null,
        finishedAt: null,
        errorCode: null,
        errorSummary: null,
        diagnostics: Prisma.JsonNull,
      },
    });
    if (changed.count !== 1) {
      const current = await this.prisma.backtestJob.findUnique({ where: { id } });
      if (!current) throw new NotFoundException('回测 Run 不存在');
      if (current.status === 'succeeded') return current;
      throw new BadRequestException('只有 failed Run 可以 retry');
    }
    const retried = await this.prisma.backtestJob.findUnique({ where: { id } });
    return this.queueService?.ensureEnqueued(id) ?? retried;
  }

  async comparableDataFingerprint(
    runId: string,
    range: ComparableDataFingerprintRange,
  ): Promise<string> {
    const job = await this.prisma.backtestJob.findUnique({ where: { id: runId } });
    if (!job) throw new NotFoundException('回测 Run 不存在');
    if (persistedContractVersion(job) !== 3)
      throw new BadRequestException('旧 Run 持久化合同拒绝比较');
    const snapshot = await loadVerifiedBacktestV3Snapshot(job, this.snapshotStoreForRun());
    if (!snapshot) throw new BadRequestException('Run Snapshot 不存在');
    if (snapshot.status !== 'finalized')
      throw new BadRequestException('Run Snapshot 尚未 finalized');
    const artifacts = [] as Array<{ key: string; rows: ArtifactRow[] }>;
    for (const artifact of snapshot.artifacts) {
      const key = artifact.key.startsWith(`${runId}/`)
        ? artifact.key.slice(runId.length + 1)
        : artifact.key;
      if (key.startsWith('metadata/')) continue;
      const rows: ArtifactRow[] = [];
      for await (const row of await this.snapshotStoreForRun().artifacts.openRead(artifact))
        rows.push(row);
      artifacts.push({ key, rows: comparableRows(rows, range, key) });
    }
    artifacts.sort((left, right) => left.key.localeCompare(right.key));
    return hashCanonicalManifest({
      version: 'v3-comparable-data-v1',
      range,
      executionPriceProtocol: snapshot.executionPriceProtocol,
      frozenExecutionWindow: snapshot.frozenExecutionWindow ?? null,
      actualSources: [
        ...new Set(
          snapshot.actualSources.map((source) =>
            canonicalizeManifest({
              symbol: source.symbol,
              routeKey: source.routeKey,
              provenance: source.provenance,
              ...(snapshot.frozenExecutionWindow
                ? {}
                : { inputFingerprint: source.inputFingerprint }),
            }),
          ),
        ),
      ].sort(),
      artifacts,
    });
  }
}
