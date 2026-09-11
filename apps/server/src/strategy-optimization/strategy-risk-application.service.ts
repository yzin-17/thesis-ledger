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
  riskApplicationPreviewInputSchema,
  riskApplicationUpdateSchema,
  riskApplicationUpgradeSchema,
  strategySchemaV2,
  type StrategySchemaV2,
} from '@thesis-ledger/schemas';
import { PrismaService } from '../platform/prisma.service.js';
import { StrategyRiskApplicationStoreService } from './strategy-risk-application-store.service.js';
import type {
  ActualRiskContext,
  StrategyRiskApplicationRow,
} from './strategy-risk-application.types.js';
import { StrategyRiskContextService } from './strategy-risk-context.service.js';
import { StrategyRiskEvaluationStoreService } from './strategy-risk-evaluation-store.service.js';

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
const sha256 = (value: unknown) =>
  createHash('sha256').update(canonicalStrategyMonitoringJson(value)).digest('hex');

@Injectable()
export class StrategyRiskApplicationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly contexts: StrategyRiskContextService,
    private readonly store: StrategyRiskApplicationStoreService,
    private readonly evaluations: StrategyRiskEvaluationStoreService,
  ) {}

  private assertEnabled() {
    if (!featureEnabled()) throw new BadRequestException('策略来源风险监控当前已关闭');
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

  async monitoringPlan(strategyVersionId: string) {
    this.assertEnabled();
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
    const preview = await this.preview(parsed);
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
    const notification = input.notification ?? current.notification;
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
      await this.store.syncFrozenRuleEnabled(transaction, id, enabled, updated.revision);
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
    return this.updateTransaction(id, await this.get(id), parsed);
  }

  async upgradePreview(id: string, targetStrategyVersionId: string) {
    const current = await this.get(id);
    const preview = await this.preview({
      strategyVersionId: targetStrategyVersionId,
      accountId: current.accountId,
      symbol: current.symbol,
      cycleMode: current.cycleMode,
    });
    const before = new Map(
      (current.plan as StrategyMonitoringPlan).rules.map((rule) => [rule.sourceKey, rule]),
    );
    const after = new Map(preview.plan.rules.map((rule) => [rule.sourceKey, rule]));
    const keys = new Set([...before.keys(), ...after.keys()]);
    return {
      ...preview,
      currentRevision: current.revision,
      diff: [...keys].map((sourceKey) => this.ruleDiff(sourceKey, before, after)),
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
    const preview = await this.upgradePreview(id, parsed.targetStrategyVersionId);
    this.validatePreview(preview, parsed.previewHash);
    return this.upgradeTransaction(id, current, parsed, preview);
  }

  private deferredEvaluations(
    application: StrategyRiskApplicationRow,
    plan: StrategyMonitoringPlan,
    actual: ActualRiskContext,
  ) {
    const anchor = application.cycleAnchor as {
      tradeId?: string | null;
      positionId?: string | null;
    } | null;
    const sameCycle = Boolean(
      actual.context.quantity &&
        anchor &&
        (anchor.tradeId ? anchor.tradeId === actual.tradeId : anchor.positionId === actual.positionId),
    );
    if (application.cycleMode !== 'nextPositionCycle' || !sameCycle) return null;
    return plan.rules.map((rule) => ({
      sourceKey: rule.sourceKey,
      state: 'not_applicable' as const,
      threshold: rule.threshold,
      reason: '应用配置为下一持仓周期，当前持仓周期不参与监控',
      ...(actual.context.occurredAt ? { occurredAt: actual.context.occurredAt } : {}),
      ...(actual.context.availableAt ? { availableAt: actual.context.availableAt } : {}),
    }));
  }

  async evaluate(id: string) {
    this.assertEnabled();
    const application = await this.get(id);
    const version = await this.strategyVersion(application.strategyVersionId);
    const actual = await this.contexts.load(
      application.accountId,
      application.symbol,
      version.strategy,
    );
    const plan = application.plan as StrategyMonitoringPlan;
    const evaluations =
      this.deferredEvaluations(application, plan, actual) ??
      evaluateStrategyMonitoringPlan(plan, actual.context);
    const persistedEvents = await this.evaluations.persist(application, plan, evaluations);
    return { application, evaluations, persistedEvents };
  }
}
