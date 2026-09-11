import { createHash, randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  canonicalStrategyMonitoringJson,
  compileStrategyMonitoringPlan,
  evaluateStrategyMonitoringPlan,
  type StrategyMonitoringContext,
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

export type StrategyRiskApplicationRow = {
  id: string;
  ownerKey: string;
  strategyVersionId: string;
  accountId: string;
  symbol: string;
  revision: number;
  semanticVersion: string;
  planHash: string;
  plan: unknown;
  cycleMode: string;
  cycleAnchor: unknown;
  enabled: boolean;
  notification: unknown;
  coverage: unknown;
  idempotencyKey: string;
  createdAt: Date;
  updatedAt: Date;
  archivedAt: Date | null;
};

type StrategyVersionRecord = {
  id: string;
  strategyId: string;
  version: number;
  schemaVersion: number;
  schema: unknown;
};

type ActualContext = {
  positionId?: string;
  tradeId?: string;
  openedAt?: string;
  context: StrategyMonitoringContext;
};

const featureEnabled = () => process.env.STRATEGY_RISK_APPLICATIONS_ENABLED !== 'false';
const sha256 = (value: unknown) =>
  createHash('sha256').update(canonicalStrategyMonitoringJson(value)).digest('hex');

const asJson = (value: unknown): Prisma.InputJsonValue => value as Prisma.InputJsonValue;

@Injectable()
export class StrategyRiskApplicationService {
  constructor(private readonly prisma: PrismaService) {}

  private assertEnabled() {
    if (!featureEnabled()) throw new BadRequestException('策略来源风险监控当前已关闭');
  }

  private async strategyVersion(id: string): Promise<StrategyVersionRecord & { strategy: StrategySchemaV2 }> {
    const version = await this.prisma.strategyVersion.findUnique({ where: { id } });
    if (!version) throw new NotFoundException('策略版本不存在');
    if (version.schemaVersion !== 2 || version.version <= 0)
      throw new BadRequestException('风险应用只能来源于正式 V2 策略版本');
    const parsed = strategySchemaV2.parse(version.schema) as StrategySchemaV2;
    return { ...version, strategy: parsed };
  }

  async monitoringPlan(strategyVersionId: string) {
    this.assertEnabled();
    const version = await this.strategyVersion(strategyVersionId);
    const strategyHash = sha256(version.strategy);
    const purePlan = compileStrategyMonitoringPlan(version.strategy, strategyHash, strategyVersionId);
    return { ...purePlan, planHash: sha256({ ...purePlan, planHash: undefined }) };
  }

  private async actualContext(
    accountId: string,
    symbol: string,
    strategy: StrategySchemaV2,
  ): Promise<ActualContext> {
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
      select: { id: true, active: true },
    });
    if (!account) throw new NotFoundException('账户不存在');
    if (!account.active) throw new BadRequestException('账户已停用');
    if (strategy.executionInstrument.symbol !== symbol)
      throw new BadRequestException('风险应用标的必须与策略执行标的一致');

    const position = await this.prisma.position.findUnique({
      where: { accountId_symbol: { accountId, symbol } },
      select: { id: true, quantity: true, costPrice: true, updatedAt: true },
    });
    const trade = await this.prisma.trade.findFirst({
      where: { accountId, symbol, accountMode: 'actual', lifecycle: 'ACTIVE' },
      orderBy: [{ openedAt: 'desc' }, { createdAt: 'desc' }],
      select: { id: true, openedAt: true },
    });

    if (strategy.executionInstrument.assetType === 'fund') {
      const nav = await this.prisma.fundNavPoint.findFirst({
        where: { symbol },
        orderBy: { navDate: 'desc' },
      });
      const holdingPeriods =
        trade?.openedAt && nav
          ? await this.prisma.fundNavPoint.count({
              where: { symbol, navDate: { gte: trade.openedAt, lte: nav.navDate } },
            })
          : undefined;
      return {
        ...(position?.id === undefined ? {} : { positionId: position.id }),
        ...(trade?.id === undefined ? {} : { tradeId: trade.id }),
        ...(trade?.openedAt === null || trade?.openedAt === undefined
          ? {}
          : { openedAt: trade.openedAt.toISOString() }),
        context: {
          ...(position?.quantity === undefined ? {} : { quantity: position.quantity.toString() }),
          ...(position?.costPrice === undefined ? {} : { averageCost: position.costPrice.toString() }),
          ...(nav === null ? {} : { price: nav.unitNav.toString() }),
          ...(holdingPeriods === undefined ? {} : { holdingPeriods: Math.max(0, holdingPeriods - 1) }),
          ...(nav === null ? {} : { occurredAt: nav.navDate.toISOString(), availableAt: nav.fetchedAt.toISOString() }),
        },
      };
    }

    const bar = await this.prisma.marketBar.findFirst({
      where: { symbol, timeframe: strategy.primaryTimeframe },
      orderBy: { timestamp: 'desc' },
    });
    const holdingPeriods =
      trade?.openedAt && bar
        ? await this.prisma.marketBar.count({
            where: {
              symbol,
              timeframe: strategy.primaryTimeframe,
              timestamp: { gte: trade.openedAt, lte: bar.timestamp },
            },
          })
        : undefined;
    return {
      ...(position?.id === undefined ? {} : { positionId: position.id }),
      ...(trade?.id === undefined ? {} : { tradeId: trade.id }),
      ...(trade?.openedAt === null || trade?.openedAt === undefined
        ? {}
        : { openedAt: trade.openedAt.toISOString() }),
      context: {
        ...(position?.quantity === undefined ? {} : { quantity: position.quantity.toString() }),
        ...(position?.costPrice === undefined ? {} : { averageCost: position.costPrice.toString() }),
        ...(bar === null ? {} : { price: bar.close.toString() }),
        ...(holdingPeriods === undefined ? {} : { holdingPeriods: Math.max(0, holdingPeriods - 1) }),
        ...(bar === null ? {} : { occurredAt: bar.timestamp.toISOString(), availableAt: bar.fetchedAt.toISOString() }),
      },
    };
  }

  private previewHash(input: {
    plan: StrategyMonitoringPlan;
    accountId: string;
    symbol: string;
    cycleMode: string;
    actual: ActualContext;
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

  async preview(input: unknown) {
    this.assertEnabled();
    const parsed = riskApplicationPreviewInputSchema.parse(input);
    const version = await this.strategyVersion(parsed.strategyVersionId);
    const plan = await this.monitoringPlan(parsed.strategyVersionId);
    const actual = await this.actualContext(parsed.accountId, parsed.symbol, version.strategy);
    const evaluations = evaluateStrategyMonitoringPlan(plan, actual.context);
    const previewHash = this.previewHash({
      plan,
      accountId: parsed.accountId,
      symbol: parsed.symbol,
      cycleMode: parsed.cycleMode,
      actual,
    });
    return {
      previewHash,
      plan,
      evaluations,
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

  async list(accountId?: string, symbol?: string) {
    return this.prisma.$queryRaw<StrategyRiskApplicationRow[]>(Prisma.sql`
      SELECT * FROM "StrategyRiskApplication"
      WHERE "ownerKey" = 'local-user'
        AND "archivedAt" IS NULL
        ${accountId ? Prisma.sql`AND "accountId" = ${accountId}::uuid` : Prisma.empty}
        ${symbol ? Prisma.sql`AND "symbol" = ${symbol}` : Prisma.empty}
      ORDER BY "updatedAt" DESC, "id" DESC
    `);
  }

  async get(id: string) {
    const rows = await this.prisma.$queryRaw<StrategyRiskApplicationRow[]>(Prisma.sql`
      SELECT * FROM "StrategyRiskApplication"
      WHERE "id" = ${id}::uuid AND "ownerKey" = 'local-user'
      LIMIT 1
    `);
    const row = rows[0];
    if (!row) throw new NotFoundException('策略风险应用不存在');
    return row;
  }

  private async createFrozenRules(
    transaction: Prisma.TransactionClient,
    applicationId: string,
    accountId: string,
    symbol: string,
    revision: number,
    enabled: boolean,
    plan: StrategyMonitoringPlan,
  ) {
    for (const rule of plan.rules) {
      const created = await transaction.riskRule.create({
        data: {
          kind: rule.kind,
          scope: 'security',
          severity: 'warning',
          threshold: rule.threshold,
          enabled,
          symbol,
          accountId,
          sourcePlanId: applicationId,
          condition: asJson({
            semanticVersion: rule.semanticVersion,
            sourceKey: rule.sourceKey,
            metric: rule.metric,
            operator: rule.operator,
          }),
          parameters: asJson({ applicationRevision: revision }),
          config: asJson(rule),
        },
      });
      await transaction.riskRuleAudit.create({
        data: {
          ruleId: created.id,
          ruleVersion: created.version,
          action: 'strategy-application-create',
          actor: 'local-user',
          after: asJson({ applicationId, revision, rule }),
        },
      });
    }
  }

  async create(input: unknown) {
    this.assertEnabled();
    const parsed = riskApplicationCreateSchema.parse(input);
    const existing = await this.prisma.$queryRaw<StrategyRiskApplicationRow[]>(Prisma.sql`
      SELECT * FROM "StrategyRiskApplication" WHERE "idempotencyKey" = ${parsed.idempotencyKey} LIMIT 1
    `);
    if (existing[0]) return existing[0];
    const preview = await this.preview(parsed);
    if (preview.previewHash !== parsed.previewHash)
      throw new BadRequestException('风险规则预览已经过期，请刷新后重新确认');
    if (preview.plan.rules.length === 0) throw new BadRequestException('该策略没有可生成的风险监控规则');
    const id = randomUUID();
    const cycleAnchor = {
      positionId: preview.context.positionId,
      tradeId: preview.context.tradeId,
      openedAt: preview.context.openedAt,
    };
    try {
      return await this.prisma.$transaction(async (transaction) => {
        if (parsed.enabled) {
          const enabledRows = await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`
            SELECT "id" FROM "StrategyRiskApplication"
            WHERE "accountId" = ${parsed.accountId}::uuid AND "symbol" = ${parsed.symbol}
              AND "enabled" = true AND "archivedAt" IS NULL
            LIMIT 1 FOR UPDATE
          `);
          if (enabledRows.length > 0)
            throw new BadRequestException('该账户与标的已经有启用中的策略风险应用');
        }
        const rows = await transaction.$queryRaw<StrategyRiskApplicationRow[]>(Prisma.sql`
          INSERT INTO "StrategyRiskApplication" (
            "id", "strategyVersionId", "accountId", "symbol", "revision", "semanticVersion",
            "planHash", "plan", "cycleMode", "cycleAnchor", "enabled", "notification", "coverage",
            "idempotencyKey", "updatedAt"
          ) VALUES (
            ${id}::uuid, ${parsed.strategyVersionId}::uuid, ${parsed.accountId}::uuid, ${parsed.symbol}, 1,
            'strategy-monitoring-v1', ${preview.plan.planHash}, ${JSON.stringify(preview.plan)}::jsonb,
            ${parsed.cycleMode}, ${JSON.stringify(cycleAnchor)}::jsonb, ${parsed.enabled},
            ${JSON.stringify(parsed.notification)}::jsonb, ${JSON.stringify(preview.plan.coverage)}::jsonb,
            ${parsed.idempotencyKey}, CURRENT_TIMESTAMP
          ) RETURNING *
        `);
        await this.createFrozenRules(
          transaction,
          id,
          parsed.accountId,
          parsed.symbol,
          1,
          parsed.enabled,
          preview.plan,
        );
        await transaction.$executeRaw(Prisma.sql`
          INSERT INTO "StrategyRiskApplicationAudit" ("applicationId", "revision", "action", "after")
          VALUES (${id}::uuid, 1, 'create', ${JSON.stringify(rows[0])}::jsonb)
        `);
        return rows[0]!;
      });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        const concurrent = await this.prisma.$queryRaw<StrategyRiskApplicationRow[]>(Prisma.sql`
          SELECT * FROM "StrategyRiskApplication" WHERE "idempotencyKey" = ${parsed.idempotencyKey} LIMIT 1
        `);
        if (concurrent[0]) return concurrent[0];
      }
      throw error;
    }
  }

  async update(id: string, input: unknown) {
    this.assertEnabled();
    const parsed = riskApplicationUpdateSchema.parse(input);
    const current = await this.get(id);
    const notification = parsed.notification ?? current.notification;
    const enabled = parsed.enabled ?? current.enabled;
    return this.prisma.$transaction(async (transaction) => {
      if (enabled && !current.enabled) {
        const conflict = await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`
          SELECT "id" FROM "StrategyRiskApplication"
          WHERE "accountId" = ${current.accountId}::uuid AND "symbol" = ${current.symbol}
            AND "enabled" = true AND "archivedAt" IS NULL AND "id" <> ${id}::uuid
          LIMIT 1 FOR UPDATE
        `);
        if (conflict.length > 0)
          throw new BadRequestException('该账户与标的已经有启用中的策略风险应用');
      }
      const rows = await transaction.$queryRaw<StrategyRiskApplicationRow[]>(Prisma.sql`
        UPDATE "StrategyRiskApplication"
        SET "enabled" = ${enabled}, "notification" = ${JSON.stringify(notification)}::jsonb,
            "revision" = "revision" + 1, "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${id}::uuid AND "ownerKey" = 'local-user' AND "revision" = ${parsed.expectedRevision}
        RETURNING *
      `);
      const updated = rows[0];
      if (!updated) throw new BadRequestException('风险应用已被其他操作更新，请刷新后重试');
      await transaction.riskRule.updateMany({
        where: { sourcePlanId: id, archivedAt: null },
        data: { enabled, version: { increment: 1 }, parameters: asJson({ applicationRevision: updated.revision }) },
      });
      await transaction.$executeRaw(Prisma.sql`
        INSERT INTO "StrategyRiskApplicationAudit" ("applicationId", "revision", "action", "before", "after")
        VALUES (${id}::uuid, ${updated.revision}, 'update', ${JSON.stringify(current)}::jsonb, ${JSON.stringify(updated)}::jsonb)
      `);
      return updated;
    });
  }

  async upgradePreview(id: string, targetStrategyVersionId: string) {
    const current = await this.get(id);
    const preview = await this.preview({
      strategyVersionId: targetStrategyVersionId,
      accountId: current.accountId,
      symbol: current.symbol,
      cycleMode: current.cycleMode,
    });
    const currentPlan = current.plan as StrategyMonitoringPlan;
    const byKey = new Map(currentPlan.rules.map((rule) => [rule.sourceKey, rule]));
    const nextByKey = new Map(preview.plan.rules.map((rule) => [rule.sourceKey, rule]));
    const sourceKeys = new Set([...byKey.keys(), ...nextByKey.keys()]);
    const diff = [...sourceKeys].map((sourceKey) => ({
      sourceKey,
      before: byKey.get(sourceKey) ?? null,
      after: nextByKey.get(sourceKey) ?? null,
      change:
        !byKey.has(sourceKey) ? 'added' : !nextByKey.has(sourceKey) ? 'removed' : canonicalStrategyMonitoringJson(byKey.get(sourceKey)) === canonicalStrategyMonitoringJson(nextByKey.get(sourceKey)) ? 'unchanged' : 'changed',
    }));
    return { ...preview, currentRevision: current.revision, diff };
  }

  async upgrade(id: string, input: unknown) {
    this.assertEnabled();
    const parsed = riskApplicationUpgradeSchema.parse(input);
    const existing = await this.prisma.$queryRaw<Array<{ applicationId: string }>>(Prisma.sql`
      SELECT "applicationId" FROM "StrategyRiskApplicationAudit"
      WHERE "applicationId" = ${id}::uuid AND "action" = ${`upgrade:${parsed.idempotencyKey}`}
      LIMIT 1
    `);
    if (existing[0]) return this.get(id);
    const current = await this.get(id);
    if (current.revision !== parsed.expectedRevision)
      throw new BadRequestException('风险应用已被其他操作更新，请刷新后重试');
    const preview = await this.upgradePreview(id, parsed.targetStrategyVersionId);
    if (preview.previewHash !== parsed.previewHash)
      throw new BadRequestException('升级预览已经过期，请刷新后重新确认');
    return this.prisma.$transaction(async (transaction) => {
      await transaction.riskRule.updateMany({
        where: { sourcePlanId: id, archivedAt: null },
        data: { enabled: false, archivedAt: new Date(), version: { increment: 1 } },
      });
      const rows = await transaction.$queryRaw<StrategyRiskApplicationRow[]>(Prisma.sql`
        UPDATE "StrategyRiskApplication"
        SET "strategyVersionId" = ${parsed.targetStrategyVersionId}::uuid,
            "planHash" = ${preview.plan.planHash}, "plan" = ${JSON.stringify(preview.plan)}::jsonb,
            "coverage" = ${JSON.stringify(preview.plan.coverage)}::jsonb,
            "revision" = "revision" + 1, "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${id}::uuid AND "revision" = ${parsed.expectedRevision}
        RETURNING *
      `);
      const updated = rows[0];
      if (!updated) throw new BadRequestException('风险应用升级发生并发冲突');
      await this.createFrozenRules(
        transaction,
        id,
        current.accountId,
        current.symbol,
        updated.revision,
        current.enabled,
        preview.plan,
      );
      await transaction.$executeRaw(Prisma.sql`
        INSERT INTO "StrategyRiskApplicationAudit" ("applicationId", "revision", "action", "before", "after")
        VALUES (${id}::uuid, ${updated.revision}, ${`upgrade:${parsed.idempotencyKey}`}, ${JSON.stringify(current)}::jsonb, ${JSON.stringify(updated)}::jsonb)
      `);
      return updated;
    });
  }

  private isDeferredCycle(application: StrategyRiskApplicationRow, actual: ActualContext) {
    if (application.cycleMode !== 'nextPositionCycle') return false;
    const anchor = application.cycleAnchor as { tradeId?: string | null; positionId?: string | null } | null;
    if (!anchor) return false;
    return Boolean(
      actual.context.quantity &&
        (anchor.tradeId ? anchor.tradeId === actual.tradeId : anchor.positionId === actual.positionId),
    );
  }

  async evaluate(id: string) {
    this.assertEnabled();
    const application = await this.get(id);
    const version = await this.strategyVersion(application.strategyVersionId);
    const actual = await this.actualContext(application.accountId, application.symbol, version.strategy);
    const plan = application.plan as StrategyMonitoringPlan;
    const evaluations = this.isDeferredCycle(application, actual)
      ? plan.rules.map((rule) => ({
          sourceKey: rule.sourceKey,
          state: 'not_applicable' as const,
          threshold: rule.threshold,
          reason: '应用配置为下一持仓周期，当前持仓周期不参与监控',
          ...(actual.context.occurredAt ? { occurredAt: actual.context.occurredAt } : {}),
          ...(actual.context.availableAt ? { availableAt: actual.context.availableAt } : {}),
        }))
      : evaluateStrategyMonitoringPlan(plan, actual.context);
    if (!application.enabled) return { application, evaluations, persistedEvents: [] };
    const rules = await this.prisma.riskRule.findMany({
      where: { sourcePlanId: id, archivedAt: null },
      select: { id: true, version: true, severity: true, config: true },
    });
    const bySourceKey = new Map(
      rules.map((rule) => [
        (rule.config as { sourceKey?: string } | null)?.sourceKey,
        rule,
      ]),
    );
    const persistedEvents: unknown[] = [];
    for (const evaluation of evaluations) {
      if (evaluation.state !== 'triggered' && evaluation.state !== 'not_triggered') continue;
      const storedRule = bySourceKey.get(evaluation.sourceKey);
      if (!storedRule) continue;
      const occurredAt = evaluation.occurredAt ?? new Date().toISOString();
      const dedupeKey = `strategy-risk:${id}:${application.revision}:${evaluation.sourceKey}:${occurredAt}`;
      const event = await this.prisma.riskEvent.upsert({
        where: { dedupeKey },
        update: {},
        create: {
          ruleId: storedRule.id,
          ruleVersion: storedRule.version,
          triggered: evaluation.state === 'triggered',
          severity: storedRule.severity,
          message: `${application.symbol} · ${evaluation.sourceKey} ${evaluation.state === 'triggered' ? '已触发' : '未触发'}`,
          mode: 'actual',
          accountId: application.accountId,
          symbol: application.symbol,
          ...(evaluation.value === undefined ? {} : { triggerValue: evaluation.value }),
          threshold: evaluation.threshold,
          marketTime: new Date(occurredAt),
          dedupeKey,
          context: asJson({
            applicationId: id,
            applicationRevision: application.revision,
            evaluation,
            costBasisPolicy: 'account-projection-average-cost-including-known-fees',
          }),
        },
      });
      persistedEvents.push(event);
      const notification = application.notification as { enabled?: boolean; cooldownMinutes?: number };
      if (evaluation.state === 'triggered' && notification?.enabled !== false) {
        const cooldownMinutes = notification.cooldownMinutes ?? 60;
        const latest = await this.prisma.notificationDelivery.findFirst({
          where: {
            subjectType: 'strategy-risk-application',
            subjectId: id,
            severity: storedRule.severity,
            scheduledAt: { gte: new Date(Date.now() - cooldownMinutes * 60_000) },
          },
          orderBy: { scheduledAt: 'desc' },
        });
        if (!latest) {
          await this.prisma.notificationDelivery.upsert({
            where: { dedupKey_channel: { dedupKey, channel: 'in-app' } },
            update: {},
            create: {
              subjectType: 'strategy-risk-application',
              subjectId: id,
              message: asJson({ applicationId: id, applicationRevision: application.revision, evaluation }),
              channel: 'in-app',
              provider: 'internal',
              severity: storedRule.severity,
              status: 'queued',
              dedupKey,
              scheduledAt: new Date(),
            },
          });
        }
      }
    }
    return { application, evaluations, persistedEvents };
  }
}
