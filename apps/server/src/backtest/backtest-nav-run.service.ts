import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  UnprocessableEntityException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import {
  backtestNavRunConfigV3Schema,
  backtestNavRunCreateV3Schema,
  strategySchema,
} from '@thesis-ledger/schemas';
import { DsaError } from '../integration/dsa/dsa.client.js';
import { DsaV3ProtocolError } from '../integration/dsa/dsa-v3-protocol.js';
import { MarketNavReaderV3 } from '../market/market-nav-reader-v3.js';
import { PrismaService } from '../platform/prisma.service.js';
import { ArtifactCorruptionError, ArtifactNotFoundError } from './backtest-artifact-store.js';
import {
  NavPreparationReceiptError,
  validateNavPreparationReceipt,
} from './backtest-nav-preparation-repository.js';
import type { NavRunPreparationV3 } from './backtest-nav-preparation.js';
import { NavInputPlanError } from './backtest-nav-planning-calendar.js';
import { hashCanonicalManifest, SnapshotIntegrityError } from './backtest-snapshot.js';
import { LocalNavSnapshotStore } from './backtest-nav-snapshot-store.js';
import { isNavBacktestInput, verifyNavRunForRead } from './backtest-nav-run-read.js';
import { BacktestQueueService } from './backtest-queue.service.js';

type NavPreparationRecord = {
  id: string;
  strategyVersionId: string;
  preparationHash: string;
  contentChecksum: string;
  request: unknown;
  evidence: unknown;
  expiresAt: Date;
  consumedRunId: string | null;
};

type NavStrategyVersion = { id: string; schemaVersion: number; schema: unknown };
type NavJobRecord = {
  id: string;
  mode: string;
  strategyVersionId: string;
  idempotencyKey: string | null;
  status: string;
  createdAt: Date;
  input: unknown;
  runConfig: unknown;
  snapshotId: string | null;
  snapshotManifest: unknown;
};

type NavPersistence = {
  navBacktestPreparation: {
    findUnique(args: unknown): Promise<NavPreparationRecord | null>;
    updateMany(args: unknown): Promise<{ count: number }>;
  };
  strategyVersion: {
    findUnique(args: unknown): Promise<NavStrategyVersion | null>;
  };
  backtestJob: {
    findFirst(args: unknown): Promise<NavJobRecord | null>;
    findUnique(args: unknown): Promise<NavJobRecord | null>;
    create(args: unknown): Promise<NavJobRecord>;
  };
  $queryRaw<T = unknown>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T>;
  $transaction<T>(
    callback: (transaction: NavPersistence) => Promise<T>,
    options: { maxWait: number; timeout: number },
  ): Promise<T>;
};

const conflict = (code: string, message: string): never => {
  throw new ConflictException({ code, message });
};

const isUniqueViolation = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

const fileSystemErrorCodes = new Set([
  'EACCES',
  'EBADF',
  'EBUSY',
  'ECANCELED',
  'EDQUOT',
  'EEXIST',
  'EFAULT',
  'EFBIG',
  'EINTR',
  'EINVAL',
  'EIO',
  'EISDIR',
  'ELOOP',
  'EMFILE',
  'EMLINK',
  'ENAMETOOLONG',
  'ENFILE',
  'ENOENT',
  'ENOMEM',
  'ENOSPC',
  'ENOTDIR',
  'ENOTEMPTY',
  'ENOTSUP',
  'ENXIO',
  'EOPNOTSUPP',
  'EPERM',
  'EPIPE',
  'EROFS',
  'ETXTBSY',
  'EXDEV',
]);

@Injectable()
export class BacktestNavRunService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(MarketNavReaderV3) private readonly reader: MarketNavReaderV3,
    @Inject(LocalNavSnapshotStore) private readonly snapshots: LocalNavSnapshotStore,
    @Optional() @Inject(BacktestQueueService) private readonly queueService?: BacktestQueueService,
  ) {}

  private database(): NavPersistence {
    return this.prisma as unknown as NavPersistence;
  }

  private async receipt(id: string) {
    const row = await this.database().navBacktestPreparation.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('NAV 准备凭证不存在');
    return row;
  }

  private async prepareReceipt(
    row: NavPreparationRecord,
    now: () => number = Date.now,
  ): Promise<NavRunPreparationV3> {
    try {
      const prepared = await validateNavPreparationReceipt(row, now);
      if (
        prepared.binding.strategyVersionId !== row.strategyVersionId ||
        prepared.binding.preparationHash !== row.preparationHash
      ) {
        conflict('NAV_PREPARATION_INVALID', 'NAV 准备凭证摘要或策略版本不匹配');
      }
      return prepared;
    } catch (error) {
      if (error instanceof ConflictException) throw error;
      if (error instanceof NavPreparationReceiptError) {
        const details = { code: error.code, message: error.message };
        if (error.statusCode === 409) throw new ConflictException(details);
        throw new UnprocessableEntityException(details);
      }
      if (!(error instanceof ZodError)) throw error;
      throw new UnprocessableEntityException({
        code: 'NAV_PREPARATION_INVALID',
        message: 'NAV 准备凭证未通过完整证据核验，请重新准备',
      });
    }
  }

  private async currentVersion(
    db: NavPersistence,
    prepared: NavRunPreparationV3,
  ): Promise<NavStrategyVersion> {
    const version = await db.strategyVersion.findUnique({
      where: { id: prepared.binding.strategyVersionId },
    });
    if (!version) throw new NotFoundException('策略版本不存在');
    const strategy = strategySchema.safeParse(version.schema);
    if (
      version.schemaVersion !== 2 ||
      !strategy.success ||
      hashCanonicalManifest(strategy.data) !== prepared.binding.strategyContentHash
    ) {
      conflict('NAV_PREPARATION_STALE', '策略版本已变化，请重新准备 NAV 输入');
    }
    return version;
  }

  private assertLiveEvidence(prepared: NavRunPreparationV3, now = Date.now()) {
    const admission = prepared.selection.response.admission;
    const validFrom = Date.parse(admission.validFrom);
    const validUntil = Date.parse(admission.validUntil);
    const recordedAt = Date.parse(admission.recordedAt);
    const capturedAt = Date.parse(prepared.selection.response.source.capturedAt);
    if (
      !Number.isFinite(validFrom) ||
      !Number.isFinite(validUntil) ||
      !Number.isFinite(recordedAt) ||
      !Number.isFinite(capturedAt) ||
      validFrom > now ||
      validUntil <= now ||
      recordedAt > now ||
      capturedAt > now
    ) {
      conflict('NAV_PREPARATION_STALE', 'NAV 来源准入已失效，请重新准备');
    }
  }

  private async assertRouteStillCurrent(prepared: NavRunPreparationV3) {
    this.assertLiveEvidence(prepared);
    let current: unknown;
    try {
      current = await this.reader.currentRouteState(prepared.selection.request.routeKey);
    } catch (error) {
      if (error instanceof DsaError || error instanceof DsaV3ProtocolError) {
        conflict('NAV_PREPARATION_STALE', 'NAV 路由当前不可用或已变化，请重新准备');
      }
      throw error;
    }
    if (!isDeepStrictEqual(current, prepared.selection.routeState)) {
      conflict('NAV_PREPARATION_STALE', 'NAV 路由已变化，请重新准备');
    }
  }

  private async findByIdempotency(strategyVersionId: string, idempotencyKey: string) {
    return this.database().backtestJob.findFirst({
      where: { strategyVersionId, idempotencyKey },
    });
  }

  private async readIdempotent(
    job: NavJobRecord,
    preparationId: string,
    preparationHash: string,
    idempotencyKey: string,
  ) {
    const input = asRecord(job.input);
    if (
      !isNavBacktestInput(job.input) ||
      input?.preparationId !== preparationId ||
      input.preparationHash !== preparationHash ||
      job.idempotencyKey !== idempotencyKey
    ) {
      conflict('IDEMPOTENCY_KEY_CONFLICT', '幂等键已用于不同 NAV 准备凭证');
    }
    return this.read(job.id);
  }

  async create(input: unknown) {
    const request = backtestNavRunCreateV3Schema.parse(input);
    const initialReceipt = await this.receipt(request.preparationId);
    if (initialReceipt.preparationHash !== request.preparationHash) {
      conflict('NAV_PREPARATION_STALE', '准备凭证摘要不匹配');
    }

    const existing = await this.findByIdempotency(
      initialReceipt.strategyVersionId,
      request.idempotencyKey,
    );
    if (existing) {
      return this.readIdempotent(
        existing,
        request.preparationId,
        request.preparationHash,
        request.idempotencyKey,
      );
    }
    if (initialReceipt.consumedRunId) {
      const consumed = await this.database().backtestJob.findUnique({
        where: { id: initialReceipt.consumedRunId },
      });
      if (consumed) {
        return this.readIdempotent(
          consumed,
          request.preparationId,
          request.preparationHash,
          request.idempotencyKey,
        );
      }
      conflict('NAV_PREPARATION_CONSUMED', 'NAV 准备凭证已被另一个 Run 消费');
    }

    const prepared = await this.prepareReceipt(initialReceipt);
    if (initialReceipt.expiresAt.getTime() <= Date.now()) {
      conflict('NAV_PREPARATION_EXPIRED', 'NAV 准备凭证已过期，请重新准备');
    }
    await this.currentVersion(this.database(), prepared);
    await this.assertRouteStillCurrent(prepared);

    const runId = randomUUID();
    let snapshotManifest: unknown = Prisma.JsonNull;
    let snapshotId: string | null = null;
    let frozen = false;
    let errorCode: string | null = 'NAV_RUNNER_UNAVAILABLE';
    let errorSummary: string | null = 'NAV 冻结输入已保存；NAV V3 执行分支尚未启用。';
    try {
      const response = prepared.selection.response;
      const manifest = await this.snapshots.freeze({
        runId,
        strategyVersionId: prepared.binding.strategyVersionId,
        source: {
          ...response.source,
          routeKey: response.routeKey,
          target: {
            providerId: response.routeTarget.providerId,
            upstreamSource: response.routeTarget.upstreamSource,
          },
          policyRevision: response.effectivePolicyRevision,
        },
        facts: prepared.facts,
        context: prepared.context,
      });
      const replay = await this.snapshots.replay(runId);
      if (!isDeepStrictEqual(replay.manifest, manifest)) {
        throw new SnapshotIntegrityError('NAV Snapshot 回放与刚冻结的 Manifest 不一致');
      }
      snapshotManifest = manifest;
      snapshotId = manifest.contentHash;
      frozen = true;
    } catch (error) {
      if (!isKnownSnapshotFailure(error)) throw error;
      errorCode = 'NAV_SNAPSHOT_INVALID';
      errorSummary = 'NAV 冻结输入未通过完整性核验，Run 已安全终止。';
    }

    const queued = frozen && this.queueService?.supportsNavExecution() === true;
    const status = queued ? 'queued' : 'failed';
    const stage = status;
    const progress = queued ? 0 : 100;
    if (queued) {
      errorCode = null;
      errorSummary = null;
    }

    try {
      const persistedId = await this.database().$transaction(
        async (transaction) => {
          await transaction.$queryRaw<Array<{ id: string }>>`
            SELECT "id" FROM "NavBacktestPreparation"
            WHERE "id" = ${request.preparationId}::uuid
            FOR UPDATE
          `;
          const row = await transaction.navBacktestPreparation.findUnique({
            where: { id: request.preparationId },
          });
          if (!row) throw new NotFoundException('NAV 准备凭证不存在');
          if (
            row.preparationHash !== request.preparationHash ||
            row.strategyVersionId !== prepared.binding.strategyVersionId
          ) {
            conflict('NAV_PREPARATION_STALE', '准备凭证在创建期间已变化');
          }
          if (row.consumedRunId) {
            const consumed = await transaction.backtestJob.findUnique({
              where: { id: row.consumedRunId },
            });
            if (consumed) {
              const consumedInput = asRecord(consumed.input);
              if (
                consumed.idempotencyKey === request.idempotencyKey &&
                consumedInput?.preparationId === request.preparationId &&
                consumedInput.preparationHash === request.preparationHash
              ) {
                return consumed.id;
              }
            }
            conflict('NAV_PREPARATION_CONSUMED', 'NAV 准备凭证已被另一个 Run 消费');
          }

          const lockedPrepared = await this.prepareReceipt(row);
          await transaction.$queryRaw<Array<{ id: string }>>`
            SELECT "id" FROM "StrategyVersion"
            WHERE "id" = ${row.strategyVersionId}::uuid
            FOR SHARE
          `;
          await this.currentVersion(transaction, lockedPrepared);
          this.assertLiveEvidence(lockedPrepared);
          await this.assertRouteStillCurrent(lockedPrepared);
          const createdAt = new Date();
          this.assertLiveEvidence(lockedPrepared, createdAt.getTime());
          if (row.expiresAt.getTime() <= createdAt.getTime()) {
            conflict('NAV_PREPARATION_EXPIRED', 'NAV 准备凭证已过期，请重新准备');
          }

          const runConfig = backtestNavRunConfigV3Schema.parse(lockedPrepared.runConfig);
          const created = await transaction.backtestJob.create({
            data: {
              id: runId,
              strategyVersionId: row.strategyVersionId,
              mode: 'V3',
              idempotencyKey: request.idempotencyKey,
              status,
              stage,
              progress,
              periodStart: new Date(`${runConfig.startDate}T00:00:00.000Z`),
              periodEnd: new Date(`${runConfig.endDate}T00:00:00.000Z`),
              dataAsOf: new Date(runConfig.dataAsOf),
              input: {
                contractVersion: 3,
                schemaVersion: '3',
                inputKind: 'nav',
                runConfig: runConfig as unknown as Prisma.InputJsonValue,
                preparationId: request.preparationId,
                preparationHash: request.preparationHash,
              } as Prisma.InputJsonValue,
              runConfig: runConfig as unknown as Prisma.InputJsonValue,
              executionAttempt: 0,
              dispatchedAt: null,
              errorCode,
              errorSummary,
              finishedAt: queued ? null : createdAt,
              createdAt,
              updatedAt: createdAt,
              snapshotId,
              snapshotManifest,
            },
          });
          const consumed = await transaction.navBacktestPreparation.updateMany({
            where: {
              id: request.preparationId,
              preparationHash: request.preparationHash,
              consumedRunId: null,
            },
            data: { consumedRunId: created.id },
          });
          if (consumed.count !== 1) {
            conflict('NAV_PREPARATION_CONSUMED', 'NAV 准备凭证已被另一个 Run 消费');
          }
          return created.id;
        },
        { maxWait: 30000, timeout: 30000 },
      );
      if (queued) await this.queueService.ensureEnqueued(persistedId);
      return this.read(persistedId);
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const raced = await this.findByIdempotency(
        initialReceipt.strategyVersionId,
        request.idempotencyKey,
      );
      if (raced) {
        return this.readIdempotent(
          raced,
          request.preparationId,
          request.preparationHash,
          request.idempotencyKey,
        );
      }
      conflict('NAV_PREPARATION_CONSUMED', 'NAV 准备凭证已被另一个 Run 消费');
    }
  }

  async read(id: string) {
    const job = await this.database().backtestJob.findUnique({ where: { id } });
    if (!job) throw new NotFoundException('NAV Run 不存在');
    const input = asRecord(job.input);
    if (!isNavBacktestInput(job.input) || input?.inputKind !== 'nav') {
      conflict('NAV_RUN_INTEGRITY_INVALID', '所选记录不是现行 NAV Run');
    }
    const preparationId = input?.preparationId;
    if (typeof preparationId !== 'string') {
      throw new ConflictException({
        code: 'NAV_RUN_INTEGRITY_INVALID',
        message: 'NAV Run 缺少准备凭证关联',
      });
    }
    const preparation = await this.database().navBacktestPreparation.findUnique({
      where: { consumedRunId: id },
    });
    if (!preparation) {
      throw new ConflictException({
        code: 'NAV_RUN_INTEGRITY_INVALID',
        message: 'NAV Run 的准备凭证关联不存在',
      });
    }
    const prepared = await this.prepareReceipt(preparation, () => job.createdAt.getTime());
    if (preparation.consumedRunId !== job.id) {
      conflict('NAV_RUN_INTEGRITY_INVALID', 'NAV Run 与准备凭证消费关联不一致');
    }
    const version = await this.database().strategyVersion.findUnique({
      where: { id: job.strategyVersionId },
    });
    const storedStrategy = strategySchema.safeParse(version?.schema);
    if (
      version?.schemaVersion !== 2 ||
      !storedStrategy.success ||
      hashCanonicalManifest(storedStrategy.data) !== prepared.binding.strategyContentHash
    ) {
      conflict('NAV_RUN_INTEGRITY_INVALID', 'NAV Run 所属策略版本与冻结证据不一致');
    }
    return verifyNavRunForRead({
      job: job as never,
      preparation,
      prepared,
      snapshots: this.snapshots,
    });
  }
}

function isKnownSnapshotFailure(error: unknown): boolean {
  const code =
    typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
  return (
    error instanceof SnapshotIntegrityError ||
    error instanceof NavInputPlanError ||
    error instanceof ArtifactCorruptionError ||
    error instanceof ArtifactNotFoundError ||
    error instanceof ZodError ||
    (typeof code === 'string' && fileSystemErrorCodes.has(code))
  );
}
