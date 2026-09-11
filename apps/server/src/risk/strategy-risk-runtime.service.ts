import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  evaluateStrategyMonitoringRule,
  type RiskEvent,
  type StrategyMonitoringEvaluation,
} from '@thesis-ledger/domain';
import { monitoringRuleDefinitionSchema } from '@thesis-ledger/schemas';
import { PrismaService } from '../platform/prisma.service.js';
import type { EvaluationCandidate, StoredRule } from './risk-types.js';
import {
  StrategyRiskContextService,
  type StrategyRiskActualContext,
} from './strategy-risk-context.service.js';

type StrategyRiskApplicationRuntimeRow = {
  id: string;
  accountId: string;
  symbol: string;
  revision: number;
  cycleMode: 'existingAndFuture' | 'nextPositionCycle';
  cycleAnchor: unknown;
  enabled: boolean;
  notification: unknown;
};

export type StrategyRiskRuntimeEvaluation = {
  application: StrategyRiskApplicationRuntimeRow;
  evaluation: StrategyMonitoringEvaluation;
  candidate?: EvaluationCandidate;
  event?: RiskEvent;
  notification: { enabled: boolean; cooldownMinutes: number };
};

const toRecord = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

@Injectable()
export class StrategyRiskRuntimeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly contexts: StrategyRiskContextService,
  ) {}

  private async application(id: string) {
    const rows = await this.prisma.$queryRaw<StrategyRiskApplicationRuntimeRow[]>(Prisma.sql`
      SELECT "id", "accountId", "symbol", "revision", "cycleMode", "cycleAnchor", "enabled", "notification"
      FROM "StrategyRiskApplication"
      WHERE "id"=${id}::uuid AND "ownerKey"='local-user' AND "archivedAt" IS NULL
      LIMIT 1
    `);
    const application = rows[0];
    if (!application) throw new NotFoundException('策略风险应用不存在');
    return application;
  }

  private notification(application: StrategyRiskApplicationRuntimeRow) {
    const value = toRecord(application.notification);
    return {
      enabled: value.enabled !== false,
      cooldownMinutes:
        typeof value.cooldownMinutes === 'number' && Number.isFinite(value.cooldownMinutes)
          ? Math.max(0, Math.floor(value.cooldownMinutes))
          : 60,
    };
  }

  private assertCurrentRevision(stored: StoredRule, application: StrategyRiskApplicationRuntimeRow) {
    const revision = toRecord(stored.parameters).applicationRevision;
    if (typeof revision === 'number' && revision !== application.revision)
      throw new BadRequestException('策略风险规则修订已经失效，请刷新后重试');
  }

  private async target(symbol: string, timeframe: string) {
    const asset = await this.prisma.asset.findUnique({
      where: { symbol },
      select: { assetType: true, market: true },
    });
    if (!asset) throw new NotFoundException('策略风险应用标的不存在');
    return {
      executionInstrument: { symbol, assetType: asset.assetType, market: asset.market },
      primaryTimeframe: timeframe,
    };
  }

  private deferredEvaluation(
    application: StrategyRiskApplicationRuntimeRow,
    rule: ReturnType<typeof monitoringRuleDefinitionSchema.parse>,
    actual: StrategyRiskActualContext,
  ): StrategyMonitoringEvaluation | null {
    if (application.cycleMode !== 'nextPositionCycle') return null;
    const anchor = toRecord(application.cycleAnchor);
    const hasPosition = Number(actual.context.quantity ?? '0') > 0;
    const sameCycle = Boolean(
      hasPosition &&
        ((typeof anchor.tradeId === 'string' && anchor.tradeId === actual.tradeId) ||
          (typeof anchor.tradeId !== 'string' &&
            typeof anchor.positionId === 'string' &&
            anchor.positionId === actual.positionId)),
    );
    if (!sameCycle) return null;
    return {
      sourceKey: rule.sourceKey,
      state: 'not_applicable',
      threshold: rule.threshold,
      reason: '应用配置为下一持仓周期，当前持仓周期不参与监控',
      ...(actual.context.occurredAt ? { occurredAt: actual.context.occurredAt } : {}),
      ...(actual.context.availableAt ? { availableAt: actual.context.availableAt } : {}),
    };
  }

  private runtimeEvent(
    stored: StoredRule,
    application: StrategyRiskApplicationRuntimeRow,
    rule: ReturnType<typeof monitoringRuleDefinitionSchema.parse>,
    evaluation: StrategyMonitoringEvaluation,
    actual: StrategyRiskActualContext,
    evaluatedAt: Date,
  ): { candidate: EvaluationCandidate; event: RiskEvent } | null {
    if (!['triggered', 'not_triggered'].includes(evaluation.state) || evaluation.value === undefined)
      return null;
    const marketTime = evaluation.occurredAt ?? evaluatedAt.toISOString();
    const value = Number(evaluation.value);
    const threshold = Number(evaluation.threshold);
    if (!Number.isFinite(value) || !Number.isFinite(threshold)) return null;
    const inputs: Record<string, number> = {};
    const price = Number(actual.context.price);
    const costPrice = Number(actual.context.averageCost);
    const quantity = Number(actual.context.quantity);
    if (Number.isFinite(price)) inputs.price = price;
    if (Number.isFinite(costPrice)) inputs.costPrice = costPrice;
    if (actual.context.holdingPeriods !== undefined)
      inputs.holdingPeriods = actual.context.holdingPeriods;
    const candidate: EvaluationCandidate = {
      scope: 'security',
      mode: 'actual',
      marketTime,
      dataQuality: {
        source: 'strategy-monitoring',
        ...(evaluation.availableAt ? { availableAt: evaluation.availableAt } : {}),
      },
      symbol: application.symbol,
      accountId: application.accountId,
      domain: {
        symbol: application.symbol,
        accountId: application.accountId,
        ...(actual.positionId ? { positionId: actual.positionId } : {}),
        ...(Number.isFinite(quantity) ? { quantity } : {}),
        ...(Number.isFinite(price) ? { price } : {}),
        ...(Number.isFinite(costPrice) ? { costPrice } : {}),
        marketTime,
      },
    };
    const event: RiskEvent = {
      id: `${stored.id}:${application.accountId}:${application.symbol}:${marketTime}`,
      ruleId: stored.id,
      triggered: evaluation.state === 'triggered',
      severity: stored.severity as RiskEvent['severity'],
      message: `${application.symbol} · ${rule.label} ${evaluation.state === 'triggered' ? '已触发' : '未触发'}`,
      evaluatedAt: evaluatedAt.toISOString(),
      context: {
        value,
        reference: threshold,
        symbol: application.symbol,
        accountId: application.accountId,
        ...(actual.positionId ? { positionId: actual.positionId } : {}),
        ...(Number.isFinite(quantity) ? { quantity } : {}),
        marketTime,
        inputs,
        metadata: {
          valueMetric: rule.metric,
          strategyRiskApplicationId: application.id,
          applicationRevision: application.revision,
          sourceKey: rule.sourceKey,
          semanticVersion: rule.semanticVersion,
        },
      },
    };
    return { candidate, event };
  }

  async evaluateStoredRule(stored: StoredRule, evaluatedAt = new Date()): Promise<StrategyRiskRuntimeEvaluation> {
    if (!stored.sourcePlanId) throw new BadRequestException('规则缺少策略风险应用来源');
    const application = await this.application(stored.sourcePlanId);
    this.assertCurrentRevision(stored, application);
    if (stored.accountId !== application.accountId || stored.symbol !== application.symbol)
      throw new BadRequestException('策略风险规则目标与来源应用不一致');
    const rule = monitoringRuleDefinitionSchema.parse(stored.config);
    const actual = await this.contexts.load(
      application.accountId,
      application.symbol,
      await this.target(application.symbol, rule.evaluationTimeframe),
      evaluatedAt,
    );
    const evaluation =
      this.deferredEvaluation(application, rule, actual) ??
      evaluateStrategyMonitoringRule(rule, actual.context);
    const runtime = this.runtimeEvent(stored, application, rule, evaluation, actual, evaluatedAt);
    return {
      application,
      evaluation,
      ...(runtime ?? {}),
      notification: this.notification(application),
    };
  }
}
