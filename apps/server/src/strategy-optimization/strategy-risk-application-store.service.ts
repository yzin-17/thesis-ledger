import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { StrategyMonitoringPlan } from '@thesis-ledger/domain';
import { PrismaService } from '../platform/prisma.service.js';
import type { StrategyRiskApplicationRow } from './strategy-risk-application.types.js';

const asJson = (value: unknown): Prisma.InputJsonValue => value as Prisma.InputJsonValue;

@Injectable()
export class StrategyRiskApplicationStoreService {
  constructor(private readonly prisma: PrismaService) {}

  list(accountId?: string, symbol?: string) {
    return this.prisma.$queryRaw<StrategyRiskApplicationRow[]>(Prisma.sql`
      SELECT * FROM "StrategyRiskApplication"
      WHERE "ownerKey"='local-user' AND "archivedAt" IS NULL
        ${accountId ? Prisma.sql`AND "accountId"=${accountId}::uuid` : Prisma.empty}
        ${symbol ? Prisma.sql`AND "symbol"=${symbol}` : Prisma.empty}
      ORDER BY "updatedAt" DESC, "id" DESC
    `);
  }

  async get(id: string) {
    const rows = await this.prisma.$queryRaw<StrategyRiskApplicationRow[]>(Prisma.sql`
      SELECT * FROM "StrategyRiskApplication"
      WHERE "id"=${id}::uuid AND "ownerKey"='local-user' LIMIT 1
    `);
    const row = rows[0];
    if (!row) throw new NotFoundException('策略风险应用不存在');
    return row;
  }

  async findByIdempotencyKey(idempotencyKey: string) {
    const rows = await this.prisma.$queryRaw<StrategyRiskApplicationRow[]>(Prisma.sql`
      SELECT * FROM "StrategyRiskApplication" WHERE "idempotencyKey"=${idempotencyKey} LIMIT 1
    `);
    return rows[0] ?? null;
  }

  async assertNoEnabledConflict(
    transaction: Prisma.TransactionClient,
    accountId: string,
    symbol: string,
    excludeId?: string,
  ) {
    const rows = await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id" FROM "StrategyRiskApplication"
      WHERE "accountId"=${accountId}::uuid AND "symbol"=${symbol}
        AND "enabled"=true AND "archivedAt" IS NULL
        ${excludeId ? Prisma.sql`AND "id" <> ${excludeId}::uuid` : Prisma.empty}
      LIMIT 1 FOR UPDATE
    `);
    if (rows.length > 0)
      throw new BadRequestException('该账户与标的已经有启用中的策略风险应用');
  }

  async createFrozenRules(
    transaction: Prisma.TransactionClient,
    input: {
      applicationId: string;
      accountId: string;
      symbol: string;
      revision: number;
      enabled: boolean;
      plan: StrategyMonitoringPlan;
    },
  ) {
    for (const rule of input.plan.rules) {
      const created = await transaction.riskRule.create({
        data: {
          kind: rule.kind,
          scope: 'security',
          severity: 'warning',
          threshold: rule.threshold,
          enabled: input.enabled,
          symbol: input.symbol,
          accountId: input.accountId,
          sourcePlanId: input.applicationId,
          condition: asJson({
            semanticVersion: rule.semanticVersion,
            sourceKey: rule.sourceKey,
            metric: rule.metric,
            operator: rule.operator,
          }),
          parameters: asJson({ applicationRevision: input.revision }),
          config: asJson(rule),
        },
      });
      await transaction.riskRuleAudit.create({
        data: {
          ruleId: created.id,
          ruleVersion: created.version,
          action: 'strategy-application-create',
          actor: 'local-user',
          after: asJson({
            applicationId: input.applicationId,
            revision: input.revision,
            rule,
          }),
        },
      });
    }
  }

  async insertApplication(
    transaction: Prisma.TransactionClient,
    input: {
      id: string;
      strategyVersionId: string;
      accountId: string;
      symbol: string;
      plan: StrategyMonitoringPlan;
      cycleMode: string;
      cycleAnchor: unknown;
      enabled: boolean;
      notification: unknown;
      idempotencyKey: string;
    },
  ) {
    const rows = await transaction.$queryRaw<StrategyRiskApplicationRow[]>(Prisma.sql`
      INSERT INTO "StrategyRiskApplication" (
        "id", "strategyVersionId", "accountId", "symbol", "revision", "semanticVersion",
        "planHash", "plan", "cycleMode", "cycleAnchor", "enabled", "notification", "coverage",
        "idempotencyKey", "updatedAt"
      ) VALUES (
        ${input.id}::uuid, ${input.strategyVersionId}::uuid, ${input.accountId}::uuid, ${input.symbol}, 1,
        'strategy-monitoring-v1', ${input.plan.planHash}, ${JSON.stringify(input.plan)}::jsonb,
        ${input.cycleMode}, ${JSON.stringify(input.cycleAnchor)}::jsonb, ${input.enabled},
        ${JSON.stringify(input.notification)}::jsonb, ${JSON.stringify(input.plan.coverage)}::jsonb,
        ${input.idempotencyKey}, CURRENT_TIMESTAMP
      ) RETURNING *
    `);
    return rows[0]!;
  }

  async updateApplication(
    transaction: Prisma.TransactionClient,
    input: {
      id: string;
      expectedRevision: number;
      enabled: boolean;
      notification: unknown;
    },
  ) {
    const rows = await transaction.$queryRaw<StrategyRiskApplicationRow[]>(Prisma.sql`
      UPDATE "StrategyRiskApplication"
      SET "enabled"=${input.enabled}, "notification"=${JSON.stringify(input.notification)}::jsonb,
          "revision"="revision"+1, "updatedAt"=CURRENT_TIMESTAMP
      WHERE "id"=${input.id}::uuid AND "ownerKey"='local-user' AND "revision"=${input.expectedRevision}
      RETURNING *
    `);
    const updated = rows[0];
    if (!updated) throw new BadRequestException('风险应用已被其他操作更新，请刷新后重试');
    return updated;
  }

  syncFrozenRuleEnabled(
    transaction: Prisma.TransactionClient,
    applicationId: string,
    enabled: boolean,
    revision: number,
  ) {
    return transaction.riskRule.updateMany({
      where: { sourcePlanId: applicationId, archivedAt: null },
      data: {
        enabled,
        version: { increment: 1 },
        parameters: asJson({ applicationRevision: revision }),
      },
    });
  }

  archiveFrozenRules(transaction: Prisma.TransactionClient, applicationId: string) {
    return transaction.riskRule.updateMany({
      where: { sourcePlanId: applicationId, archivedAt: null },
      data: { enabled: false, archivedAt: new Date(), version: { increment: 1 } },
    });
  }

  async replacePlan(
    transaction: Prisma.TransactionClient,
    input: {
      id: string;
      expectedRevision: number;
      strategyVersionId: string;
      plan: StrategyMonitoringPlan;
    },
  ) {
    const rows = await transaction.$queryRaw<StrategyRiskApplicationRow[]>(Prisma.sql`
      UPDATE "StrategyRiskApplication"
      SET "strategyVersionId"=${input.strategyVersionId}::uuid,
          "planHash"=${input.plan.planHash}, "plan"=${JSON.stringify(input.plan)}::jsonb,
          "coverage"=${JSON.stringify(input.plan.coverage)}::jsonb,
          "revision"="revision"+1, "updatedAt"=CURRENT_TIMESTAMP
      WHERE "id"=${input.id}::uuid AND "revision"=${input.expectedRevision}
      RETURNING *
    `);
    const updated = rows[0];
    if (!updated) throw new BadRequestException('风险应用升级发生并发冲突');
    return updated;
  }

  audit(
    transaction: Prisma.TransactionClient,
    input: {
      applicationId: string;
      revision: number;
      action: string;
      before?: unknown;
      after?: unknown;
    },
  ) {
    return transaction.$executeRaw(Prisma.sql`
      INSERT INTO "StrategyRiskApplicationAudit" ("applicationId", "revision", "action", "before", "after")
      VALUES (
        ${input.applicationId}::uuid, ${input.revision}, ${input.action},
        ${input.before === undefined ? null : JSON.stringify(input.before)}::jsonb,
        ${input.after === undefined ? null : JSON.stringify(input.after)}::jsonb
      )
    `);
  }
}
