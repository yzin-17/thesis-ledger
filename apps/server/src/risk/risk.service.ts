import { BadRequestException, Injectable } from '@nestjs/common';
import {
  evaluateCompleteRule,
  type CompleteRiskContext,
  type RiskRule,
} from '@thesis-ledger/domain';
import {
  riskRuleInputSchema,
  riskRuleUpdateSchema,
  riskScanContextSchema,
} from '@thesis-ledger/schemas';
import type { Prisma } from '@prisma/client';
import { NotificationService } from '../notifications/notification.service.js';
import { PrismaService } from '../platform/prisma.service.js';

type ScanContext = ReturnType<typeof riskScanContextSchema.parse>;
type PortfolioMode = 'actual' | 'shadow';
type StoredRule = {
  id: string;
  version: number;
  kind: string;
  scope: string;
  severity: string;
  threshold: unknown;
  enabled: boolean;
  symbol: string | null;
  accountId: string | null;
  sourcePlanId?: string | null;
  parameters?: unknown;
};

@Injectable()
export class RiskService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService,
  ) {}

  async createRule(input: unknown) {
    const rule = riskRuleInputSchema.parse(input);
    return this.prisma.$transaction(async (transaction) => {
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

  listRules() {
    return this.prisma.riskRule.findMany({ orderBy: { createdAt: 'asc' } });
  }

  async updateRule(id: string, input: unknown) {
    const patch = riskRuleUpdateSchema.parse(input);
    return this.prisma.$transaction(async (transaction) => {
      const stored = await transaction.riskRule.findUniqueOrThrow({ where: { id } });
      const merged = riskRuleInputSchema.parse({
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
      });
      const updated = await transaction.riskRule.update({
        where: { id },
        data: { ...this.ruleData(merged), version: { increment: 1 } },
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
        data: { enabled: false, version: { increment: 1 } },
      });
      await transaction.riskRuleAudit.create({
        data: {
          ruleId: id,
          ruleVersion: updated.version,
          action: 'delete',
          actor: 'local-user',
          before: this.snapshot(stored),
          after: this.snapshot(updated),
        },
      });
      return updated;
    });
  }

  async testRule(id: string, input: unknown) {
    const { contexts, allowStale } = this.parseScanInput(input);
    this.rejectStaleContexts(contexts, allowStale);
    const stored = await this.prisma.riskRule.findUniqueOrThrow({ where: { id } });
    const events = this.evaluateStoredRule(stored, contexts).map(({ event }) => event);
    await this.prisma.riskRuleAudit.create({
      data: {
        ruleId: id,
        ruleVersion: stored.version,
        action: 'test',
        actor: 'local-user',
        after: { eventCount: events.length },
      },
    });
    return events;
  }

  audit(id: string) {
    return this.prisma.riskRuleAudit.findMany({
      where: { ruleId: id },
      orderBy: { createdAt: 'desc' },
    });
  }

  async scan(input: unknown) {
    const { contexts, allowStale } = this.parseScanInput(input);
    this.rejectStaleContexts(contexts, allowStale);
    const rules = await this.prisma.riskRule.findMany({
      where: { enabled: true, effectiveAt: { lte: new Date() } },
    });
    const traceId = crypto.randomUUID();
    const results: Array<{ ruleId: string; eventId?: string; error?: string }> = [];
    for (const stored of rules) {
      try {
        for (const { candidate, event } of this.evaluateStoredRule(stored, contexts)) {
          if (!event.triggered) continue;
          const saved = await this.prisma.riskEvent.create({
            data: {
              ruleId: stored.id,
              ruleVersion: stored.version,
              triggered: true,
              severity: event.severity,
              message: event.message,
              ...(candidate.accountId === undefined ? {} : { accountId: candidate.accountId }),
              symbol: candidate.symbol,
              triggerValue: event.context.value,
              threshold: Number(stored.threshold),
              marketTime: new Date(candidate.marketTime),
              context: {
                ...event.context,
                mode: candidate.mode,
                traceId,
                dataQuality: candidate.dataQuality,
              },
            },
          });
          if (candidate.mode === 'shadow') {
            results.push({ ruleId: stored.id, eventId: saved.id });
            continue;
          }
          try {
            await this.notifications.enqueue(saved.id, event.severity, {
              channels: {
                info: ['feishu'],
                warning: ['feishu'],
                error: ['feishu'],
                critical: ['feishu'],
              },
              cooldownMinutes: 30,
              maxAttempts: 3,
              criticalBypassCooldown: true,
            });
            results.push({ ruleId: stored.id, eventId: saved.id });
          } catch (notificationError) {
            results.push({
              ruleId: stored.id,
              eventId: saved.id,
              error: `风险已记录，通知排队失败：${notificationError instanceof Error ? notificationError.message : '未知错误'}`,
            });
          }
        }
      } catch (error) {
        results.push({
          ruleId: stored.id,
          error: error instanceof Error ? error.message : '规则评估失败',
        });
      }
    }
    return { traceId, results };
  }

  async history(mode: PortfolioMode = 'actual') {
    const events = await this.prisma.riskEvent.findMany({
      orderBy: { evaluatedAt: 'desc' },
      take: 200,
    });
    return events.filter((event) => {
      const context = event.context;
      if (typeof context !== 'object' || context === null || !('mode' in context))
        return mode === 'actual';
      return (context as { mode?: unknown }).mode === mode;
    });
  }

  private ruleData(rule: ReturnType<typeof riskRuleInputSchema.parse>) {
    return {
      kind: rule.kind,
      scope: rule.scope,
      severity: rule.severity,
      threshold: rule.threshold,
      enabled: rule.enabled,
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

  private parseScanInput(input: unknown) {
    if (Array.isArray(input)) {
      return { contexts: riskScanContextSchema.array().parse(input), allowStale: false };
    }
    const envelope = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
    return {
      contexts: riskScanContextSchema.array().parse(envelope.contexts),
      allowStale: envelope.allowStale === true,
    };
  }

  private rejectStaleContexts(contexts: ScanContext[], allowStale: boolean) {
    if (allowStale) return;
    if (
      contexts.some(
        (context) =>
          context.dataQuality.freshness === 'stale' ||
          context.dataQuality.marketData === 'stale' ||
          context.dataQuality.financials === 'stale',
      )
    )
      throw new BadRequestException('风险扫描上下文包含 stale 数据，请刷新后重试');
  }

  private evaluateStoredRule(stored: StoredRule, contexts: ScanContext[]) {
    const rule: RiskRule = {
      id: stored.id,
      version: stored.version,
      kind: stored.kind as RiskRule['kind'],
      scope: stored.scope as RiskRule['scope'],
      severity: stored.severity as RiskRule['severity'],
      threshold: Number(stored.threshold),
      enabled: stored.enabled,
      ...(stored.symbol === null ? {} : { symbol: stored.symbol }),
      ...(stored.accountId === null ? {} : { accountId: stored.accountId }),
      ...(stored.parameters === undefined || stored.parameters === null
        ? {}
        : { parameters: stored.parameters as RiskRule['parameters'] }),
    };
    const candidates = this.contextsForRule(rule, contexts);
    if (candidates.length === 0)
      throw new Error(
        `规则 ${stored.id}（${stored.scope}）未找到匹配上下文，请检查 accountId/symbol/scope`,
      );
    return candidates.map((candidate) => ({
      candidate,
      event: evaluateCompleteRule(rule, candidate as CompleteRiskContext),
    }));
  }

  private contextsForRule(rule: RiskRule, contexts: ScanContext[]) {
    if (rule.scope === 'security')
      return contexts.filter((context) => context.symbol === rule.symbol);
    if (rule.scope === 'account')
      return contexts.filter((context) => context.accountId === rule.accountId);
    return contexts;
  }

  private snapshot(value: StoredRule | Record<string, unknown>) {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }
}
