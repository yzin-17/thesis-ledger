import { BadRequestException, Injectable } from '@nestjs/common';
import {
  requiresRiskRuleAccount,
  riskRuleInputSchema,
  riskRuleStoredSchema,
  riskRuleUpdateSchema,
} from '@thesis-ledger/schemas';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../platform/prisma.service.js';

@Injectable()
export class RiskRuleService {
  constructor(private readonly prisma: PrismaService) {}

  async createRule(input: unknown) {
    const rule = riskRuleInputSchema.parse(input);
    return this.prisma.$transaction(async (transaction) => {
      await this.assertRuleTarget(transaction, rule, true);
      const created = await transaction.riskRule.create({ data: this.ruleData(rule) });
      await transaction.riskRuleAudit.create({
        data: {
          ruleId: created.id,
          ruleVersion: created.version,
          action: 'create',
          actor: 'local-user',
          after: this.snapshot(created),
        },
      });
      return created;
    });
  }

  async listRules(includeArchived = false) {
    const rules = await this.prisma.riskRule.findMany({
      orderBy: { createdAt: 'asc' },
      ...(includeArchived ? {} : { where: { archivedAt: null } }),
    });
    return this.withAssetNames(rules);
  }

  // 证券规则的 symbol 只有代码，展示层需要 Asset.name 作为标的名
  private async withAssetNames<T extends { symbol: string | null }>(rules: T[]) {
    const symbols = [
      ...new Set(rules.map((rule) => rule.symbol).filter((symbol): symbol is string => !!symbol)),
    ];
    if (symbols.length === 0) return rules.map((rule) => ({ ...rule, assetName: null }));
    const assets = await this.prisma.asset.findMany({
      where: { symbol: { in: symbols } },
      select: { symbol: true, name: true },
    });
    const names = new Map(assets.map((asset) => [asset.symbol, asset.name]));
    return rules.map((rule) => ({
      ...rule,
      assetName: rule.symbol ? (names.get(rule.symbol) ?? null) : null,
    }));
  }

  listEnabledRules() {
    return this.prisma.riskRule.findMany({
      where: {
        enabled: true,
        needsRepair: false,
        archivedAt: null,
        effectiveAt: { lte: new Date() },
      },
    });
  }

  getRule(id: string) {
    return this.prisma.riskRule.findUniqueOrThrow({ where: { id } });
  }

  async updateRule(id: string, input: unknown) {
    const patch = riskRuleUpdateSchema.parse(input);
    const enableRequested =
      input !== null &&
      typeof input === 'object' &&
      (input as Record<string, unknown>).enabled === true;
    return this.prisma.$transaction(async (transaction) => {
      const stored = await transaction.riskRule.findUniqueOrThrow({ where: { id } });
      if (stored.archivedAt)
        throw new BadRequestException('规则已归档，请先恢复后再编辑或启停');
      const mergedInput = {
        kind: stored.kind,
        scope: stored.scope,
        severity: stored.severity,
        threshold: Number(stored.threshold),
        enabled: stored.enabled,
        ...(stored.symbol === null ? {} : { symbol: stored.symbol }),
        ...(stored.accountId === null ? {} : { accountId: stored.accountId }),
        ...(stored.sourcePlanId === null ? {} : { sourcePlanId: stored.sourcePlanId }),
        ...(stored.condition === null ? {} : { condition: stored.condition }),
        ...(stored.parameters === null ? {} : { parameters: stored.parameters }),
        ...(stored.config === null ? {} : { config: stored.config }),
        effectiveAt: stored.effectiveAt.toISOString(),
        ...patch,
      };
      const needsRepair =
        requiresRiskRuleAccount(String(mergedInput.kind), String(mergedInput.scope)) &&
        !mergedInput.accountId;
      if (needsRepair && enableRequested)
        throw new BadRequestException('该规则需要先补齐账户和标的后才能启用');
      const merged = needsRepair
        ? riskRuleStoredSchema.parse({ ...mergedInput, enabled: false })
        : riskRuleInputSchema.parse(mergedInput);
      const targetChanged =
        (patch.kind !== undefined && patch.kind !== stored.kind) ||
        (patch.scope !== undefined && patch.scope !== stored.scope) ||
        (patch.symbol !== undefined && patch.symbol !== stored.symbol) ||
        (patch.accountId !== undefined && patch.accountId !== stored.accountId);
      if (targetChanged && needsRepair)
        throw new BadRequestException('该规则需要同时补齐账户和标的后才能保存');
      if (!needsRepair && (targetChanged || enableRequested))
        await this.assertRuleTarget(transaction, merged, true);
      const updated = await transaction.riskRule.update({
        where: { id },
        data: {
          ...this.ruleData(merged),
          needsRepair,
          repairReason: needsRepair ? 'account-binding-required' : null,
          version: { increment: 1 },
        },
      });
      const action = patch.enabled === undefined ? 'update' : patch.enabled ? 'enable' : 'disable';
      await transaction.riskRuleAudit.create({
        data: {
          ruleId: id,
          ruleVersion: updated.version,
          action,
          actor: 'local-user',
          before: this.snapshot(stored),
          after: this.snapshot(updated),
        },
      });
      return updated;
    });
  }

  archiveRule(id: string) {
    return this.prisma.$transaction(async (transaction) => {
      const stored = await transaction.riskRule.findUniqueOrThrow({ where: { id } });
      const updated = await transaction.riskRule.update({
        where: { id },
        data: {
          enabled: false,
          // 重复归档保留首次归档时间，便于审计追溯
          ...(stored.archivedAt ? {} : { archivedAt: new Date() }),
          version: { increment: 1 },
        },
      });
      await transaction.riskRuleAudit.create({
        data: {
          ruleId: id,
          ruleVersion: updated.version,
          action: 'archive',
          actor: 'local-user',
          before: this.snapshot(stored),
          after: this.snapshot(updated),
        },
      });
      return updated;
    });
  }

  restoreRule(id: string) {
    return this.prisma.$transaction(async (transaction) => {
      const stored = await transaction.riskRule.findUniqueOrThrow({ where: { id } });
      if (!stored.archivedAt) throw new BadRequestException('规则未归档，无需恢复');
      // 恢复后规则回到工作台列表并保持停用，由用户确认后再手动启用
      const updated = await transaction.riskRule.update({
        where: { id },
        data: { archivedAt: null, version: { increment: 1 } },
      });
      await transaction.riskRuleAudit.create({
        data: {
          ruleId: id,
          ruleVersion: updated.version,
          action: 'restore',
          actor: 'local-user',
          before: this.snapshot(stored),
          after: this.snapshot(updated),
        },
      });
      return updated;
    });
  }

  audit(id: string) {
    return this.prisma.riskRuleAudit.findMany({
      where: { ruleId: id },
      orderBy: { createdAt: 'desc' },
    });
  }

  recordTestAudit(id: string, ruleVersion: number, eventCount: number) {
    return this.prisma.riskRuleAudit.create({
      data: {
        ruleId: id,
        ruleVersion,
        action: 'test',
        actor: 'local-user',
        after: { eventCount },
      },
    });
  }

  private async assertRuleTarget(
    transaction: Prisma.TransactionClient,
    rule: {
      kind: string;
      scope: string;
      accountId?: string | undefined;
      symbol?: string | undefined;
    },
    requirePosition: boolean,
  ) {
    const accountBound = rule.scope === 'account' || requiresRiskRuleAccount(rule.kind, rule.scope);
    if (!accountBound || !rule.accountId) return;
    const account = await transaction.account.findUnique({
      where: { id: rule.accountId },
      select: { id: true, active: true },
    });
    if (!account) throw new BadRequestException('绑定账户不存在');
    if (!account.active) throw new BadRequestException('绑定账户已停用');
    if (!requiresRiskRuleAccount(rule.kind, rule.scope) || !requirePosition) return;
    if (!rule.symbol) throw new BadRequestException('价格类持仓规则必须绑定证券标的');
    const position = await transaction.position.findUnique({
      where: { accountId_symbol: { accountId: rule.accountId, symbol: rule.symbol } },
      select: { id: true, quantity: true },
    });
    if (!position || Number(position.quantity) <= 0)
      throw new BadRequestException('绑定标的不在该账户当前持仓中');
  }

  private ruleData(rule: ReturnType<typeof riskRuleStoredSchema.parse>) {
    return {
      kind: rule.kind,
      scope: rule.scope,
      severity: rule.severity,
      threshold: rule.threshold,
      enabled: rule.enabled,
      needsRepair: false,
      repairReason: null,
      ...(rule.symbol === undefined ? {} : { symbol: rule.symbol }),
      ...(rule.accountId === undefined ? {} : { accountId: rule.accountId }),
      ...(rule.sourcePlanId === undefined ? {} : { sourcePlanId: rule.sourcePlanId }),
      ...(rule.condition === undefined
        ? {}
        : { condition: rule.condition as Prisma.InputJsonValue }),
      ...(rule.parameters === undefined
        ? {}
        : { parameters: rule.parameters as Prisma.InputJsonValue }),
      ...(rule.config === undefined ? {} : { config: rule.config as Prisma.InputJsonValue }),
      ...(rule.effectiveAt === undefined ? {} : { effectiveAt: new Date(rule.effectiveAt) }),
    };
  }

  private snapshot(value: object): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }
}
