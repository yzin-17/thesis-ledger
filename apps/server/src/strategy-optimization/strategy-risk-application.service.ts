import { createHash, randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  canonicalStrategyMonitoringJson,
  compileStrategyMonitoringPlan,
  evaluateStrategyMonitoringPlan,
  type StrategyMonitoringEvaluation,
  type StrategyMonitoringPlan,
} from '@thesis-ledger/domain';
import {
  riskApplicationCreateSchema,
  riskApplicationNotificationSchema,
  riskApplicationPreviewInputSchema,
  riskApplicationUpdateSchema,
  riskApplicationUpgradeSchema,
  strategySchemaV2,
  type StrategySchemaV2,
} from '@thesis-ledger/schemas';
import { PrismaService } from '../platform/prisma.service.js';
import { RiskService } from '../risk/risk.service.js';
import { StrategyRiskApplicationStoreService } from './strategy-risk-application-store.service.js';
import type {
  ActualRiskContext,
  StrategyRiskApplicationRow,
} from './strategy-risk-application.types.js';
import { StrategyRiskContextService } from './strategy-risk-context.service.js';

type StrategyVersionRecord = {
  id: string;
  strategyId: string;
  version: number;
  schemaVersion: number;
  schema: unknown;
};

type RiskPreview = {
  previewHash: string;
  plan: StrategyMonitoringPlan;
  evaluations: StrategyMonitoringEvaluation[];
  cycleMode: 'existingAndFuture' | 'nextPositionCycle';
  context: {
    positionId: string | null;
    tradeId: string | null;
    openedAt: string | null;
    occurredAt: string | null;
    availableAt: string | null;
  };
};

const featureEnabled = () => process.env.STRATEGY_RISK_APPLICATIONS_ENABLED !== 'false';
const minuteStrategyTimeframes = new Set(['1m', '5m', '15m', '30m', '60m']);
const sha256 = (value: unknown) =>
  createHash('sha256').update(canonicalStrategyMonitoringJson(value)).digest('hex');

@Injectable()
export class StrategyRiskApplicationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly contexts: StrategyRiskContextService,
    private readonly store: StrategyRiskApplicationStoreService,
    private readonly risk: RiskService,
  ) {}

  private assertEnabled() {
    if (!featureEnabled()) throw new BadRequestException('策略来源风险监控当前已关闭');
  }

  private notification(value: unknown) {
    return riskApplicationNotificationSchema.parse(value ?? {});
  }

  private async strategyVersion(
    id: string,
  ): Promise<StrategyVersionRecord & { strategy: StrategySchemaV2 }> {
    const version = await this.prisma.strategyVersion.findUnique({ where: { id } });
    if (!version) throw new NotFoundException('策略版本不存在');
    if (version.schemaVersion !== 2 || version.version <= 0)
      throw new BadRequestException('风险应用只能来源于正式 V2 策略版本');
    return {
      ...version,
      strategy: strategySchemaV2.parse(version.schema) as StrategySchemaV2,
    };
  }

  private async assertAutomaticRuntimeCapability(strategyVersionId: string) {
    const version = await this.strategyVersion(strategyVersionId);
    if (!minuteStrategyTimeframes.has(version.strategy.primaryTimeframe)) return;
    throw new BadRequestException(
      `分钟级策略风险监控当前不可启用：${version.strategy.primaryTimeframe} 依赖持续 1m MarketBar，但默认 market-sync 仅自动同步 1d；请先提供稳定 1m 自动同步能力`,
    );
  }

  async monitoringPlan(strategyVersionId: string) {
    const version = await this.strategyVersion(strategyVersionId);
    const strategyHash = sha256(version.strategy);
    const plan = compileStrategyMonitoringPlan(
      version.strategy,
      strategyHash,
      strategyVersionId,
    );
    return { ...plan, planHash: sha256({ ...plan, planHash: undefined }) };
  }

  private previewHash(input: {
    plan: StrategyMonitoringPlan;
    accountId: string;
    symbol: string;
    cycleMode: string;
    actual: ActualRiskContext;
  }) {
    return sha256({
      semanticVersion: 'strategy-risk-preview-v1',
      planHash: input.plan.planHash,
      accountId: input.accountId,
      symbol: input.symbol,
      cycleMode: input.cycleMode,
      positionId: input.actual.positionId ?? null,
      tradeId: input.actual.tradeId ?? null,
      openedAt: input.actual.openedAt ?? null,
      context: input.actual.context,
    });
  }

  async preview(input: unknown): Promise<RiskPreview> {
    this.assertEnabled();
    const parsed = riskApplicationPreviewInputSchema.parse(input);
    const [version, plan] = await Promise.all([
      this.strategyVersion(parsed.strategyVersionId),
      this.monitoringPlan(parsed.strategyVersionId),
    ]);
    const actual = await this.contexts.load(parsed.accountId, parsed.symbol, version.strategy);
    return {
      previewHash: this.previewHash({
        plan,
        accountId: parsed.accountId,
        symbol: parsed.symbol,
        cycleMode: parsed.cycleMode,
        actual,
      }),
      plan,
      evaluations: evaluateStrategyMonitoringPlan(plan, actual.context),
      cycleMode: parsed.cycleMode,
      context: {
        positionId: actual.positionId ?? null,
        tradeId: actual.tradeId ?? null,
        openedAt: actual.openedAt ?? null,
        occurredAt: actual.context.occurredAt ?? null,
        availableAt: actual.context.availableAt ?? null,
      },
    };
  }

  list(accountId?: string, symbol?: string) {
    return this.store.list(accountId, symbol);
  }

  get(id: string) {
    return this.store.get(id);
  }

  private planDiff(beforePlan: StrategyMonitoringPlan, afterPlan: StrategyMonitoringPlan) {
    const before = new Map(beforePlan.rules.map((rule) => [rule.sourceKey, rule]));
    const after = new Map(afterPlan.rules.map((rule) => [rule.sourceKey, rule]));
    const keys = new Set([...before.keys(), ...after.keys()]);
    return [...keys].map((sourceKey) => this.ruleDiff(sourceKey, before, after));
  }

  async planDiffsForTargetVersion(targetStrategyVersionId: string) {
    const [targetVersion, targetPlan] = await Promise.all([
      this.strategyVersion(targetStrategyVersionId),
      this.monitoringPlan(targetStrategyVersionId),
    ]);
    const applications = await this.prisma.$queryRaw<StrategyRiskApplicationRow[]>(Prisma.sql`
      SELECT application.*
      FROM "StrategyRiskApplication" AS application
      JOIN "StrategyVersion" AS source_version ON source_version."id"=application."strategyVersionId"
      WHERE source_version."strategyId"=${targetVersion.strategyId}::uuid
        AND application."ownerKey"='local-user'
        AND application."archivedAt" IS NULL
      ORDER BY application."updatedAt" DESC, application."id" DESC
    `);
    return applications.map((application) => ({
      applicationId: application.id,
      accountId: application.accountId,
      symbol: application.symbol,
      currentStrategyVersionId: application.strategyVersionId,
      currentRevision: application.revision,
      enabled: application.enabled,
      diff: this.planDiff(application.plan as StrategyMonitoringPlan, targetPlan),
    }));
  }

  private async createTransaction(
    id: string,
    parsed: ReturnType<typeof riskApplicationCreateSchema.parse>,
    preview: RiskPreview,
  ) {
    const cycleAnchor = {
      positionId: preview.context.positionId,
      tradeId: preview.context.tradeId,
      openedAt: preview.context.openedAt,
    };
    return this.prisma.$transaction(async (transaction) => {
      if (parsed.enabled)
        await this.store.assertNoEnabledConflict(transaction, parsed.accountId, parsed.symbol);
      const application = await this.store.insertApplication(transaction, {
        id,
        strategyVersionId: parsed.strategyVersionId,
        accountId: parsed.accountId,
        symbol: parsed.symbol,
        plan: preview.plan,
        cycleMode: parsed.cycleMode,
        cycleAnchor,
        enabled: parsed.enabled,
        notification: parsed.notification,
        idempotencyKey: parsed.idempotencyKey,
      });
      await this.store.createFrozenRules(transaction, {
        applicationId: id,
        accountId: parsed.accountId,
        symbol: parsed.symbol,
        revision: 1,
        enabled: parsed.enabled,
        severity: parsed.notification.severity,
        plan: preview.plan,
      });
      await this.store.audit(transaction, {
        applicationId: id,
        revision: 1,
        action: 'create',
        after: application,
      });
      return application;
    });
  }

  private validatePreview(preview: RiskPreview, expectedHash: string) {
    if (preview.previewHash !== expectedHash)
      throw new BadRequestException('风险规则预览已经过期，请刷新后重新确认');
    if (preview.plan.rules.length === 0)
      throw new BadRequestException('该策略没有可生成的风险监控规则');
  }

  async create(input: unknown) {
    this.assertEnabled();
    const parsed = riskApplicationCreateSchema.parse(input);
    const existing = await this.store.findByIdempotencyKey(parsed.idempotencyKey);
    if (existing) return existing;
    if (parsed.enabled) await this.assertAutomaticRuntimeCapability(parsed.strategyVersionId);
    const preview = await this.preview({
      strategyVersionId: parsed.strategyVersionId,
      accountId: parsed.accountId,
      symbol: parsed.symbol,
      cycleMode: parsed.cycleMode,
    });
    this.validatePreview(preview, parsed.previewHash);
    try {
      return await this.createTransaction(randomUUID(), parsed, preview);
    } catch (error) {
      if ((error as { code?: string }).code !== 'P2002') throw error;
      const concurrent = await this.store.findByIdempotencyKey(parsed.idempotencyKey);
      if (concurrent) return concurrent;
      throw error;
    }
  }

  private async updateTransaction(
    id: string,
    current: StrategyRiskApplicationRow,
    input: ReturnType<typeof riskApplicationUpdateSchema.parse>,
  ) {
    const enabled = input.enabled ?? current.enabled;
    const notification = input.notification ?? this.notification(current.notification);
    const enabledChanged = enabled !== current.enabled;
    return this.prisma.$transaction(async (transaction) => {
      if (enabled && !current.enabled)
        await this.store.assertNoEnabledConflict(
          transaction,
          current.accountId,
          current.symbol,
          id,
        );
      const updated = await this.store.updateApplication(transaction, {
        id,
        expectedRevision: input.expectedRevision,
        enabled,
        notification,
      });
      await this.store.syncFrozenRuleState(transaction, id, {
        enabled,
        severity: notification.severity,
        revision: updated.revision,
        enabledChanged,
      });
      await this.store.audit(transaction, {
        applicationId: id,
        revision: updated.revision,
        action: 'update',
        before: current,
        after: updated,
      });
      return updated;
    });
  }

  async update(id: string, input: unknown) {
    this.assertEnabled();
    const parsed = riskApplicationUpdateSchema.parse(input);
    const current = await this.get(id);
    if (parsed.enabled === true && !current.enabled)
      await this.assertAutomaticRuntimeCapability(current.strategyVersionId);
    return this.updateTransaction(id, current, parsed);
  }

  async upgradePreview(id: string, targetStrategyVersionId: string) {
    const current = await this.get(id);
    const preview = await this.preview({
      strategyVersionId: targetStrategyVersionId,
      accountId: current.accountId,
      symbol: current.symbol,
      cycleMode: current.cycleMode,
    });
    return {
      ...preview,
      currentRevision: current.revision,
      diff: this.planDiff(current.plan as StrategyMonitoringPlan, preview.plan),
    };
  }

  private ruleDiff(
    sourceKey: string,
    before: Map<string, StrategyMonitoringPlan['rules'][number]>,
    after: Map<string, StrategyMonitoringPlan['rules'][number]>,
  ) {
    const left = before.get(sourceKey);
    const right = after.get(sourceKey);
    const change = !left
      ? 'added'
      : !right
        ? 'removed'
        : canonicalStrategyMonitoringJson(left) === canonicalStrategyMonitoringJson(right)
          ? 'unchanged'
          : 'changed';
    return { sourceKey, before: left ?? null, after: right ?? null, change };
  }

  private async upgradeAlreadyApplied(id: string, idempotencyKey: string) {
    const rows = await this.prisma.$queryRaw<Array<{ applicationId: string }>>(Prisma.sql`
      SELECT "applicationId" FROM "StrategyRiskApplicationAudit"
      WHERE "applicationId"=${id}::uuid AND "action"=${`upgrade:${idempotencyKey}`} LIMIT 1
    `);
    return rows.length > 0;
  }

  private async upgradeTransaction(
    id: string,
    current: StrategyRiskApplicationRow,
    input: ReturnType<typeof riskApplicationUpgradeSchema.parse>,
    preview: RiskPreview,
  ) {
    const notification = this.notification(current.notification);
    return this.prisma.$transaction(async (transaction) => {
      await this.store.archiveFrozenRules(transaction, id);
      const updated = await this.store.replacePlan(transaction, {
        id,
        expectedRevision: input.expectedRevision,
        strategyVersionId: input.targetStrategyVersionId,
        plan: preview.plan,
      });
      await this.store.createFrozenRules(transaction, {
        applicationId: id,
        accountId: current.accountId,
        symbol: current.symbol,
        revision: updated.revision,
        enabled: current.enabled,
        severity: notification.severity,
        plan: preview.plan,
      });
      await this.store.audit(transaction, {
        applicationId: id,
        revision: updated.revision,
        action: `upgrade:${input.idempotencyKey}`,
        before: current,
        after: updated,
      });
      return updated;
    });
  }

  async upgrade(id: string, input: unknown) {
    this.assertEnabled();
    const parsed = riskApplicationUpgradeSchema.parse(input);
    if (await this.upgradeAlreadyApplied(id, parsed.idempotencyKey)) return this.get(id);
    const current = await this.get(id);
    if (current.revision !== parsed.expectedRevision)
      throw new BadRequestException('风险应用已被其他操作更新，请刷新后重试');
    if (current.enabled) await this.assertAutomaticRuntimeCapability(parsed.targetStrategyVersionId);
    const preview = await this.upgradePreview(id, parsed.targetStrategyVersionId);
    this.validatePreview(preview, parsed.previewHash);
    return this.upgradeTransaction(id, current, parsed, preview);
  }

  async evaluate(id: string) {
    this.assertEnabled();
    return this.risk.evaluateStrategyApplication(id);
  }
}
