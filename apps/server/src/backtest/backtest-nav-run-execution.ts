import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { BacktestJob } from '@prisma/client';
import { strategySchema } from '@thesis-ledger/schemas';
import { PrismaService } from '../platform/prisma.service.js';
import { validateNavPreparationReceipt } from './backtest-nav-preparation-receipt.js';
import { verifyNavRunForRead } from './backtest-nav-run-read.js';
import { LocalNavSnapshotStore } from './backtest-nav-snapshot-store.js';
import { LocalNavSnapshotV3Runner, type BacktestNavV3Runner } from './backtest-nav-v3-runner.js';
import { verifyNavResultV3 } from './backtest-nav-result-v3.js';
import { hashCanonicalManifest } from './backtest-snapshot.js';
import { BacktestSnapshotUnavailableError } from './backtest-v3-run-lifecycle.js';

@Injectable()
export class BacktestNavRunExecution {
  readonly runner: BacktestNavV3Runner;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(LocalNavSnapshotStore) private readonly snapshots: LocalNavSnapshotStore,
  ) {
    this.runner = new LocalNavSnapshotV3Runner(snapshots);
  }

  async execute(job: BacktestJob, signal: AbortSignal) {
    const frozen = await this.loadVerified(job);
    if (signal.aborted) throw new Error('NAV 执行已取消');
    const { manifest } = frozen;
    const result = await this.runner.runNav(
      {
        runId: job.id,
        snapshotRef: { snapshotId: manifest.contentHash, contentHash: manifest.contentHash },
        artifactRefs: [manifest.artifact, manifest.contextArtifact].map((ref) => ({
          ...ref,
          artifactId: ref.contentHash,
          key: `${manifest.runId}/${ref.key}`,
        })),
      },
      signal,
    );
    if (signal.aborted) throw new Error('NAV 执行已取消');
    // 提交前重新读取物理产物，拒绝执行过程中发生的冻结输入变化。
    const current = await this.loadVerified(job);
    try {
      const verified = verifyNavResultV3(result, current);
      if (verified.engineVersion !== this.runner.navId) throw new Error('NAV engine 身份不符');
      return { result: verified, resultChecksum: verified.resultChecksum };
    } catch {
      throw new BadRequestException('NAV Runner Result 与冻结输入不一致');
    }
  }

  async loadVerified(job: BacktestJob) {
    try {
      const preparation = await this.prisma.navBacktestPreparation.findUnique({
        where: { consumedRunId: job.id },
      });
      if (!preparation) throw new Error('NAV Run 缺少已消费准备凭证');
      const prepared = await validateNavPreparationReceipt(preparation, () =>
        job.createdAt.getTime(),
      );
      const version = await this.prisma.strategyVersion.findUnique({
        where: { id: job.strategyVersionId },
      });
      const strategy = strategySchema.safeParse(version?.schema);
      if (
        version?.schemaVersion !== 2 ||
        !strategy.success ||
        hashCanonicalManifest(strategy.data) !== prepared.binding.strategyContentHash
      )
        throw new Error('NAV Run 策略与准备凭证不一致');
      const checked = await verifyNavRunForRead({
        job,
        preparation,
        prepared,
        snapshots: this.snapshots,
      });
      if (!checked.snapshotId || !checked.snapshotManifest) throw new Error('NAV Run 尚未冻结');
      const frozen = await this.snapshots.replay(job.id);
      if (
        hashCanonicalManifest(frozen.manifest) !== hashCanonicalManifest(checked.snapshotManifest)
      )
        throw new Error('NAV 冻结输入在校验期间发生变化');
      return frozen;
    } catch (error) {
      // 基础设施查询失败仍允许当前有界重试；合同/物理输入错误不可重试。
      if (
        error instanceof Error &&
        'code' in error &&
        ['P1001', 'P1002', 'P1017'].includes(String(error.code))
      )
        throw error;
      throw new BacktestSnapshotUnavailableError(
        error instanceof Error ? error.message : 'NAV 冻结输入验证失败',
      );
    }
  }
}
