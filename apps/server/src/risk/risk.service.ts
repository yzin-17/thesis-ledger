import { BadRequestException, Injectable, Optional } from '@nestjs/common';
import { evaluateCompleteRule, type RiskRule } from '@thesis-ledger/domain';
import { StrategyRiskApplicationEvaluator } from './strategy-risk-application-evaluator.js';
import { NotificationService } from '../notifications/notification.service.js';
import { PrismaService } from '../platform/prisma.service.js';
import { MarketBarReader } from '../market/market-bar-reader.js';
import { RiskContextService } from './risk-context.service.js';
import { RiskEventService } from './risk-event.service.js';
import { riskInputUnavailableReason } from './risk-input-availability.js';
import {
  enqueueRiskNotificationIfNeeded,
  type RiskNotificationInput,
} from './risk-notification.js';
import { RiskRuleService } from './risk-rule.service.js';
import { StrategyRiskContextService } from './strategy-risk-context.service.js';
import { StrategyRiskRuntimeService } from './strategy-risk-runtime.service.js';
import type {
  EvaluationCandidate,
  ParsedScan,
  PortfolioMode,
  StoredRule,
  RiskScanResult,
} from './risk-types.js';

type RiskScanOptions = {
  evaluatedAt?: Date;
  includeStrategyRules?: boolean;
  ruleIds?: readonly string[];
};

@Injectable()
export class RiskService {
  private readonly rules: RiskRuleService;
  private readonly contexts: RiskContextService;
  private readonly events: RiskEventService;
  private readonly strategyRuntime: StrategyRiskRuntimeService;
  private readonly strategyApplications: StrategyRiskApplicationEvaluator;

  constructor(
    prisma: PrismaService,
    private readonly notifications: NotificationService,
    @Optional() ruleService?: RiskRuleService,
    @Optional() contextService?: RiskContextService,
    @Optional() eventService?: RiskEventService,
    @Optional() strategyRuntime?: StrategyRiskRuntimeService,
    @Optional() marketBarReader?: MarketBarReader,
    @Optional() strategyApplications?: StrategyRiskApplicationEvaluator,
  ) {
    this.rules = ruleService ?? new RiskRuleService(prisma);
    this.contexts = contextService ?? new RiskContextService(prisma);
    this.events = eventService ?? new RiskEventService(prisma, notifications);
    this.strategyRuntime =
      strategyRuntime ??
      new StrategyRiskRuntimeService(prisma, new StrategyRiskContextService(prisma, marketBarReader));
    this.strategyApplications = strategyApplications ?? new StrategyRiskApplicationEvaluator(this.strategyRuntime, this.events, notifications);
  }

  createRule(input: unknown) {
    return this.rules.createRule(input);
  }

  listRules(includeArchived = false) {
    return this.rules.listRules(includeArchived);
  }

  updateRule(id: string, input: unknown) {
    return this.rules.updateRule(id, input);
  }

  archiveRule(id: string) {
    return this.rules.archiveRule(id);
  }

  restoreRule(id: string) {
    return this.rules.restoreRule(id);
  }

  audit(id: string) {
    return this.rules.audit(id);
  }

  async testRule(id: string, input: unknown) {
    const parsed = await this.contexts.prepare(input, false);
    const stored = await this.rules.getRule(id);
    if (stored.sourcePlanId) {
      const evaluated = await this.strategyRuntime.evaluateStoredRule(
        stored,
        this.scanEvaluationTime(parsed),
      );
      return evaluated.event ? [evaluated.event] : [];
    }
    const events = this.evaluateStoredRule(stored, parsed, (reason) => {
      throw new BadRequestException({ error: 'input-unavailable', message: reason });
    }).map(({ event }) => event);
    await this.rules.recordTestAudit(id, stored.version, events.length);
    return events;
  }

  async scan(input: unknown, options: RiskScanOptions = {}) {
    const parsed = await this.contexts.prepare(input, true);
    const scanId = parsed.scanId ?? crypto.randomUUID();
    const includeStrategyRules = options.includeStrategyRules ?? true;
    const rules = (await this.rules.listEnabledRules()).filter((stored) =>
      (!options.ruleIds || options.ruleIds.includes(stored.id)) &&
      (!stored.sourcePlanId || includeStrategyRules));
    const traceId = crypto.randomUUID();
    const evaluatedAt = options.evaluatedAt ?? this.scanEvaluationTime(parsed);
    const results: RiskScanResult[] = [];

    for (const stored of rules) {
      try {
        if (stored.sourcePlanId) {
          await this.evaluateStrategyStoredRule(stored, evaluatedAt, scanId, traceId, results);
          continue;
        }
        const evaluated = this.evaluateStoredRule(stored, parsed, (reason, candidate) => {
          results.push({ ruleId: stored.id, errorCode: 'input-unavailable', error: `${reason}；对象 ${candidate.symbol ?? candidate.accountId ?? '组合'}` });
        });
        for (const { candidate, event } of evaluated) {
          const outcome = await this.events.persist(stored, candidate, event, scanId, traceId);
          if (!outcome.eventId) continue;
          try {
            await this.enqueueNotificationIfNeeded({
              eventId: outcome.eventId,
              severity: event.severity,
              message: event.message,
              traceId,
              mode: candidate.mode,
              created: outcome.created,
              rule: stored,
              ...(candidate.accountId === undefined ? {} : { accountId: candidate.accountId }),
              ...(candidate.symbol === undefined ? {} : { symbol: candidate.symbol }),
            });
            results.push({ ruleId: stored.id, eventId: outcome.eventId });
          } catch (notificationError) {
            results.push({
              ruleId: stored.id,
              eventId: outcome.eventId,
              errorCode: 'notification-enqueue-failed',
              error: `风险已记录，通知排队失败：${notificationError instanceof Error ? notificationError.message : '未知错误'}`,
            });
          }
        }
      } catch (error) {
        results.push({
          ruleId: stored.id,
          errorCode: 'evaluation-failed',
          error: error instanceof Error ? error.message : '规则评估失败',
        });
      }
    }
    return { traceId, scanId, evaluatedRuleCount: rules.length, results };
  }

  async evaluateStrategyApplication(applicationId: string, evaluatedAt = new Date(), options: {
    background?: boolean; ruleIds?: readonly string[];
  } = {}) {
    const rules = (await this.rules.listRules()).filter(
      (rule) => rule.sourcePlanId === applicationId &&
        (!options.ruleIds || options.ruleIds.includes(rule.id)) && (!options.background || rule.enabled),
    ) as StoredRule[];
    return this.strategyApplications.evaluate(rules, evaluatedAt, options.background ?? false);
  }

  history(mode: PortfolioMode = 'actual', options: { cursor?: string; limit?: number } = {}) {
    return this.events.history(mode, options);
  }

  private async evaluateStrategyStoredRule(
    stored: StoredRule,
    evaluatedAt: Date,
    scanId: string,
    traceId: string,
    results: RiskScanResult[],
  ) {
    const evaluated = await this.strategyRuntime.evaluateStoredRule(stored, evaluatedAt);
    if (!evaluated.application.enabled || !evaluated.event || !evaluated.candidate) return;
    const outcome = await this.events.persist(
      stored,
      evaluated.candidate,
      evaluated.event,
      scanId,
      traceId,
    );
    if (!outcome.eventId) return;
    try {
      await this.enqueueNotificationIfNeeded({
        eventId: outcome.eventId,
        severity: evaluated.event.severity,
        message: evaluated.event.message,
        traceId,
        mode: evaluated.candidate.mode,
        created: outcome.created,
        rule: stored,
        policy: evaluated.notification,
        ...(evaluated.candidate.accountId === undefined
          ? {}
          : { accountId: evaluated.candidate.accountId }),
        ...(evaluated.candidate.symbol === undefined
          ? {}
          : { symbol: evaluated.candidate.symbol }),
      });
      results.push({ ruleId: stored.id, eventId: outcome.eventId });
    } catch (notificationError) {
      results.push({
        ruleId: stored.id,
        eventId: outcome.eventId,
        errorCode: 'notification-enqueue-failed',
        error: `风险已记录，通知排队失败：${notificationError instanceof Error ? notificationError.message : '未知错误'}`,
      });
    }
  }

  private scanEvaluationTime(scan: ParsedScan) {
    const marketTimes = [
      ...scan.security.map((context) => context.marketTime),
      ...scan.accounts.map((context) => context.marketTime),
      ...(scan.portfolio ? [scan.portfolio.marketTime] : []),
    ].sort();
    const latest = marketTimes.at(-1);
    return latest ? new Date(latest) : new Date();
  }

  private async enqueueNotificationIfNeeded(
    input: RiskNotificationInput & { mode: PortfolioMode; created: boolean },
  ) {
    await enqueueRiskNotificationIfNeeded(this.notifications, input);
  }

  private evaluateStoredRule(stored: StoredRule, scan: ParsedScan,
    unavailable?: (reason: string, candidate: EvaluationCandidate) => void) {
    const rule = this.toRule(stored);
    return this.contexts
      .candidatesForRule(rule, scan)
      .filter((candidate) => {
        const reason = riskInputUnavailableReason(rule, candidate);
        if (reason) unavailable?.(reason, candidate);
        return reason === undefined;
      })
      .filter((candidate) => !this.contexts.shouldSkipStaleRule(rule.kind, candidate, scan))
      .map((candidate) => ({ candidate, event: evaluateCompleteRule(rule, candidate.domain) }))
      .filter(
        (
          result,
        ): result is {
          candidate: EvaluationCandidate;
          event: NonNullable<typeof result.event>;
        } => result.event !== null,
      );
  }

  private toRule(stored: StoredRule): RiskRule {
    return {
      id: stored.id,
      version: stored.version,
      kind: stored.kind as RiskRule['kind'],
      scope: stored.scope as RiskRule['scope'],
      severity: stored.severity as RiskRule['severity'],
      threshold: Number(stored.threshold),
      enabled: stored.enabled,
      ...(stored.symbol === null ? {} : { symbol: stored.symbol }),
      ...(stored.accountId === null ? {} : { accountId: stored.accountId }),
      ...(stored.parameters && typeof stored.parameters === 'object'
        ? { parameters: stored.parameters as Record<string, unknown> }
        : {}),
    };
  }
}
