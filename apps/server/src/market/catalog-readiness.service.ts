import {
  BadRequestException,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { DsaClient, DsaError, type CatalogJob } from '../integration/dsa/dsa.client.js';
import { StructuredLogger } from '../platform/structured-logger.js';
import { InstrumentService } from './instrument.service.js';

const CATALOG_STATUS_CHECK_INTERVAL_MS = 5 * 60_000;
const CATALOG_REFRESH_INTERVAL_MS = 24 * 60 * 60_000;
const CATALOG_JOB_POLL_INTERVAL_MS = 1_000;
const CATALOG_JOB_DEFAULT_LEASE_MS = 5 * 60_000;
const CATALOG_JOB_LEASE_GRACE_MS = 2_000;
const CATALOG_SEARCH_WAIT_TIMEOUT_MS = 5_000;
const CATALOG_RETRY_COOLDOWN_MS = 30_000;

type CatalogStatus = Awaited<ReturnType<InstrumentService['latestGeneration']>>;
type CatalogProjection = {
  generation: number;
  checksum: string;
  count: number;
  cursor: string;
  idempotent?: boolean;
  incremental?: boolean;
  deletedCount?: number;
  acknowledged: boolean;
};

export type CatalogReadinessState = 'ready' | 'stale' | 'unavailable';

export class CatalogNotReadyException extends ServiceUnavailableException {
  constructor() {
    super({
      errorCode: 'catalog_not_ready',
      message: '标的目录正在准备或暂不可用，请稍后重试',
      retryable: true,
    });
  }
}

class CatalogJobFailure extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CatalogJobFailure';
  }
}

/**
 * Keeps the local Instrument catalog usable without making a user initiate a
 * DSA synchronization. The same in-flight operation is shared by startup,
 * scheduled reconciliation, and the first search against an empty catalog.
 */
@Injectable()
export class CatalogReadinessService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new StructuredLogger('thesis-ledger.catalog-readiness');
  private reconciliationTimer: ReturnType<typeof setInterval> | undefined;
  private startupTimer: ReturnType<typeof setTimeout> | undefined;
  private synchronization: Promise<CatalogProjection> | undefined;
  private activeJobId: string | undefined;
  private lastAttemptAt: Date | undefined;
  private lastError: string | undefined;
  private retryAt = 0;

  constructor(
    private readonly instruments: InstrumentService,
    private readonly dsa: DsaClient,
  ) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;

    // Catalog preparation must never delay Nest readiness.
    this.startupTimer = setTimeout(() => void this.runNow(), 0);
    this.startupTimer.unref?.();
    this.reconciliationTimer = setInterval(
      () => void this.runNow(),
      CATALOG_STATUS_CHECK_INTERVAL_MS,
    );
    this.reconciliationTimer.unref?.();
  }

  onModuleDestroy() {
    if (this.reconciliationTimer) clearInterval(this.reconciliationTimer);
    if (this.startupTimer) clearTimeout(this.startupTimer);
  }

  /**
   * Ensure a non-empty local catalog before serving a real search query.
   * Existing catalogs are served immediately; only an empty catalog takes the
   * bounded wait for the shared background synchronization.
   */
  async ensureReady(waitMs = CATALOG_SEARCH_WAIT_TIMEOUT_MS): Promise<CatalogStatus> {
    const status = await this.instruments.latestGeneration();
    if (this.readinessState(status) !== 'unavailable') return status;

    try {
      await this.waitForSynchronization(waitMs);
    } catch {
      throw new CatalogNotReadyException();
    }

    const refreshed = await this.instruments.latestGeneration();
    if (this.readinessState(refreshed) !== 'unavailable') return refreshed;
    throw new CatalogNotReadyException();
  }

  async status() {
    const now = Date.now();
    const catalog = await this.instruments.latestGeneration();
    return {
      ...catalog,
      readinessState: this.readinessState(catalog, now),
      refreshInProgress: Boolean(this.synchronization),
      activeJobId: this.activeJobId ?? null,
      lastAttemptAt: this.lastAttemptAt?.toISOString() ?? null,
      lastError: this.lastError ?? null,
      retryAt: this.retryAt > now ? new Date(this.retryAt).toISOString() : null,
    };
  }

  /** Run one server-owned reconciliation attempt. Failures remain retryable. */
  async runNow() {
    const status = await this.instruments.latestGeneration();
    const readinessState = this.readinessState(status);
    if (readinessState === 'ready') {
      return { skipped: true, reason: '目录仍在 24 小时刷新窗口内', ready: true } as const;
    }
    if (Date.now() < this.retryAt && !this.synchronization) {
      return {
        skipped: true,
        reason: '目录同步仍在退避窗口',
        ready: readinessState !== 'unavailable',
      } as const;
    }

    try {
      const projection = await this.getOrStartSynchronization();
      this.retryAt = 0;
      this.lastError = undefined;
      return { skipped: false, ready: true, projection } as const;
    } catch (error) {
      this.retryAt = Date.now() + CATALOG_RETRY_COOLDOWN_MS;
      this.lastError = errorMessage(error);
      return {
        skipped: false,
        ready: readinessState !== 'unavailable',
        error: this.lastError,
      } as const;
    }
  }

  /** Preserve the existing manual trigger endpoint for operator diagnostics. */
  async triggerAndProject() {
    const job = await this.dsa.triggerCatalogJob();
    if (job.status !== 'succeeded') return { ...job, acknowledged: false };
    return { ...job, ...(await this.projectSucceededJob(job)) };
  }

  /** Project a succeeded DSA Job, used by both polling and status endpoints. */
  async projectSucceededJob(job: CatalogJob): Promise<CatalogProjection> {
    if (job.status !== 'succeeded') {
      throw new CatalogJobFailure(`目录同步任务未成功: ${job.status}`);
    }

    const status = await this.instruments.latestGeneration();
    if (status.generation > job.generation) {
      throw new CatalogJobFailure('本地目录 generation 高于 DSA 任务，拒绝倒退');
    }

    // DSA may return a successful no-op Job when the remote generation has not
    // changed. Avoid asking delta for the same cursor, which is intentionally
    // rejected by the local strictly-forward delta contract.
    const existingProjection = await this.acknowledgeIfCurrent(status, job);
    if (existingProjection) return existingProjection;

    try {
      let synced: Omit<CatalogProjection, 'acknowledged'>;
      if (status.cursor) {
        try {
          synced = await this.instruments.applyCatalogDelta(
            await this.dsa.catalogDelta(status.cursor),
          );
        } catch (error) {
          const concurrentProjection = await this.waitForConcurrentProjection(job);
          if (concurrentProjection) return concurrentProjection;
          if (!(error instanceof DsaError || error instanceof BadRequestException)) throw error;
          synced = await this.instruments.syncCatalog(await this.dsa.catalogSnapshot());
        }
      } else {
        synced = await this.instruments.syncCatalog(await this.dsa.catalogSnapshot());
      }

      await this.dsa.acknowledgeCatalog(synced.generation, synced.checksum);
      return { ...synced, acknowledged: true };
    } catch (error) {
      // Serializable projection can lose a race to another Server instance.
      // Treat the already committed generation as success instead of surfacing
      // a retryable search failure or attempting a second committed projection.
      const concurrentProjection = await this.waitForConcurrentProjection(job);
      if (concurrentProjection) return concurrentProjection;
      throw error;
    }
  }

  private async acknowledgeIfCurrent(
    status: CatalogStatus,
    job: CatalogJob,
  ): Promise<CatalogProjection | undefined> {
    if (status.generation !== job.generation || status.checksum !== job.checksum || !status.cursor)
      return undefined;
    await this.dsa.acknowledgeCatalog(job.generation, job.checksum);
    const checked = await this.instruments.markCatalogChecked(job.generation, job.checksum);
    return {
      generation: checked.generation,
      checksum: job.checksum,
      count: checked.instrumentCount,
      cursor: checked.cursor ?? status.cursor,
      idempotent: true,
      acknowledged: true,
    };
  }

  private waitForSynchronization(waitMs: number) {
    const synchronization = this.getOrStartSynchronization();
    return this.withTimeout(synchronization, Math.max(0, waitMs));
  }

  private getOrStartSynchronization(): Promise<CatalogProjection> {
    if (this.synchronization) return this.synchronization;
    if (Date.now() < this.retryAt) {
      return Promise.reject(new CatalogJobFailure('目录同步暂时退避'));
    }

    this.lastAttemptAt = new Date();
    const task = this.synchronizeCatalog();
    this.synchronization = task;
    void task
      .then(
        () => {
          this.retryAt = 0;
          this.lastError = undefined;
          this.activeJobId = undefined;
          if (this.synchronization === task) this.synchronization = undefined;
        },
        (error) => {
          this.logger.warn({
            operation: 'catalog.readiness.failed',
            status: 'failed',
            jobId: this.activeJobId ?? null,
            error: errorMessage(error),
          });
          this.retryAt = Date.now() + CATALOG_RETRY_COOLDOWN_MS;
          this.lastError = errorMessage(error);
          this.activeJobId = undefined;
          if (this.synchronization === task) this.synchronization = undefined;
        },
      )
      .catch(() => undefined);
    // A timed-out search still leaves the bounded background task running. Mark
    // the rejection as observed so it cannot become an unhandled rejection.
    return task;
  }

  private async synchronizeCatalog(): Promise<CatalogProjection> {
    const initialJob = await this.dsa.triggerCatalogJob();
    this.activeJobId = initialJob.id;
    this.logger.log({
      operation: 'catalog.readiness.started',
      status: initialJob.status,
      jobId: initialJob.id,
    });
    const job = await this.waitForTerminalJob(initialJob);
    if (job.status !== 'succeeded') {
      const message =
        job.error && typeof job.error === 'object' && 'message' in job.error
          ? String(job.error.message)
          : `目录同步任务未成功: ${job.status}`;
      throw new CatalogJobFailure(message);
    }

    const projection = await this.projectSucceededJob(job);
    const status = await this.instruments.latestGeneration();
    if (status.instrumentCount === 0) throw new CatalogJobFailure('DSA 返回空标的目录');
    this.logger.log({
      operation: 'catalog.readiness.completed',
      status: 'succeeded',
      jobId: job.id,
      generation: projection.generation,
      instrumentCount: status.instrumentCount,
    });
    return projection;
  }

  private async waitForTerminalJob(initialJob: CatalogJob): Promise<CatalogJob> {
    let current = initialJob;
    const fallbackDeadline = Date.now() + CATALOG_JOB_DEFAULT_LEASE_MS;
    while (current.status === 'pending' || current.status === 'running') {
      const leaseDeadline = current.leaseExpiresAt
        ? Date.parse(current.leaseExpiresAt) + CATALOG_JOB_LEASE_GRACE_MS
        : Number.NaN;
      const deadline = Number.isFinite(leaseDeadline) ? leaseDeadline : fallbackDeadline;
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        current = await this.dsa.catalogJob(current.id);
        if (current.status === 'pending' || current.status === 'running')
          throw new CatalogJobFailure('等待目录同步任务超过 DSA lease 边界');
        break;
      }
      await delay(Math.min(CATALOG_JOB_POLL_INTERVAL_MS, remaining));
      current = await this.dsa.catalogJob(current.id);
    }
    return current;
  }

  private async withTimeout<T>(promise: Promise<T>, waitMs: number): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new CatalogJobFailure('目录仍在准备中')), waitMs);
    });
    try {
      return await Promise.race([promise, timeout]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private readinessState(status: CatalogStatus, now = Date.now()): CatalogReadinessState {
    if (status.instrumentCount === 0 || !status.cursor || !status.checksum || !status.syncedAt)
      return 'unavailable';
    return now - status.syncedAt.getTime() >= CATALOG_REFRESH_INTERVAL_MS ? 'stale' : 'ready';
  }

  private async waitForConcurrentProjection(
    job: CatalogJob,
  ): Promise<CatalogProjection | undefined> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const current = await this.instruments.latestGeneration();
      const projection = await this.acknowledgeIfCurrent(current, job);
      if (projection) return projection;
      if (attempt < 4) await delay(50 * (attempt + 1));
    }
    return undefined;
  }
}

const delay = (milliseconds: number) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, milliseconds);
    timer.unref?.();
  });

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : '目录同步失败');
