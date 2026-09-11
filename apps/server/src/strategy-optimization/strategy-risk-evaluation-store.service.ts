import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  StrategyMonitoringEvaluation,
  StrategyMonitoringPlan,
} from '@thesis-ledger/domain';
import { PrismaService } from '../platform/prisma.service.js';
import type { StrategyRiskApplicationRow } from './strategy-risk-application.types.js';

const asJson = (value: unknown): Prisma.InputJsonValue => value as Prisma.InputJsonValue;

type StoredSourceRule = {
  id: string;
  version: number;
  severity: string;
  sourceKey?: string;
};

@Injectable()
export class StrategyRiskEvaluationStoreService {
  constructor(private readonly prisma: PrismaService) {}

  private async sourceRules(applicationId: string) {
    const rows = await this.prisma.riskRule.findMany({
      where: { sourcePlanId: applicationId, archivedAt: null },
      select: { id: true, version: true, severity: true, config: true },
    });
    return new Map<string, StoredSourceRule>(
      rows.flatMap((row) => {
        const sourceKey = (row.config as { sourceKey?: string } | null)?.sourceKey;
        return sourceKey ? [[sourceKey, { ...row, sourceKey }]] : [];
      }),
    );
  }

  private async persistEvent(
    application: StrategyRiskApplicationRow,
    evaluation: StrategyMonitoringEvaluation,
    rule: StoredSourceRule,
  ) {
    const occurredAt = evaluation.occurredAt ?? new Date().toISOString();
    const dedupeKey = `strategy-risk:${application.id}:${application.revision}:${evaluation.sourceKey}:${occurredAt}`;
    const event = await this.prisma.riskEvent.upsert({
      where: { dedupeKey },
      update: {},
      create: {
        ruleId: rule.id,
        ruleVersion: rule.version,
        triggered: evaluation.state === 'triggered',
        severity: rule.severity,
        message: `${application.symbol} · ${evaluation.sourceKey} ${evaluation.state === 'triggered' ? '已触发' : '未触发'}`,
        mode: 'actual',
        accountId: application.accountId,
        symbol: application.symbol,
        ...(evaluation.value === undefined ? {} : { triggerValue: evaluation.value }),
        threshold: evaluation.threshold,
        marketTime: new Date(occurredAt),
        dedupeKey,
        context: asJson({
          applicationId: application.id,
          applicationRevision: application.revision,
          evaluation,
          costBasisPolicy: 'account-projection-average-cost-including-known-fees',
        }),
      },
    });
    return { event, dedupeKey };
  }

  private async withinNotificationCooldown(
    application: StrategyRiskApplicationRow,
    severity: string,
  ) {
    const notification = application.notification as {
      enabled?: boolean;
      cooldownMinutes?: number;
    };
    if (notification.enabled === false) return true;
    const cooldownMinutes = notification.cooldownMinutes ?? 60;
    const latest = await this.prisma.notificationDelivery.findFirst({
      where: {
        subjectType: 'strategy-risk-application',
        subjectId: application.id,
        severity,
        scheduledAt: { gte: new Date(Date.now() - cooldownMinutes * 60_000) },
      },
      orderBy: { scheduledAt: 'desc' },
    });
    return latest !== null;
  }

  private async queueNotification(
    application: StrategyRiskApplicationRow,
    evaluation: StrategyMonitoringEvaluation,
    severity: string,
    dedupeKey: string,
  ) {
    if (evaluation.state !== 'triggered') return;
    if (await this.withinNotificationCooldown(application, severity)) return;
    await this.prisma.notificationDelivery.upsert({
      where: { dedupKey_channel: { dedupKey: dedupeKey, channel: 'in-app' } },
      update: {},
      create: {
        subjectType: 'strategy-risk-application',
        subjectId: application.id,
        message: asJson({
          applicationId: application.id,
          applicationRevision: application.revision,
          evaluation,
        }),
        channel: 'in-app',
        provider: 'internal',
        severity,
        status: 'queued',
        dedupKey: dedupeKey,
        scheduledAt: new Date(),
      },
    });
  }

  async persist(
    application: StrategyRiskApplicationRow,
    plan: StrategyMonitoringPlan,
    evaluations: StrategyMonitoringEvaluation[],
  ) {
    if (!application.enabled) return [];
    const sourceRules = await this.sourceRules(application.id);
    const persisted = [];
    for (const evaluation of evaluations) {
      if (!['triggered', 'not_triggered'].includes(evaluation.state)) continue;
      const rule = sourceRules.get(evaluation.sourceKey);
      if (!rule) continue;
      const { event, dedupeKey } = await this.persistEvent(application, evaluation, rule);
      persisted.push(event);
      await this.queueNotification(application, evaluation, rule.severity, dedupeKey);
    }
    void plan;
    return persisted;
  }
}
