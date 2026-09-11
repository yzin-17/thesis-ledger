import { Injectable, Optional } from '@nestjs/common';
import { evaluateCompleteRule, type RiskRule } from '@thesis-ledger/domain';
import { NotificationService } from '../notifications/notification.service.js';
import { PrismaService } from '../platform/prisma.service.js';
import { RiskContextService } from './risk-context.service.js';
import { RiskEventService } from './risk-event.service.js';
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
} from './risk-types.js';

@Injectable()
export class RiskService {
  private readonly rules: RiskRuleService;
  private readonly contexts: RiskContextService;
  private readonly events: RiskEventService;
  private readonly strategyRuntime: StrategyRiskRuntimeService;

  constructor(
    prisma: PrismaService,
    private readonly notifications: NotificationService,
    @Optional() ruleService?: RiskRuleService,
    @Optional() contextService?: RiskContextService,
    @Optional() eventService?: RiskEventService,
    @Optional() strategyRuntime?: StrategyRiskRuntimeService,
  ) {
    this.rules = ruleService ?? new RiskRuleService(prisma);
    this.contexts = contextService ?? new RiskContextService(prisma);
    this.events = eventService ?? new RiskEventService(prisma, notifications);
    this.strategyRuntime =
      strategyRuntime ??
      new StrategyRiskRuntimeService(prisma, new StrategyRiskContextService(prisma));
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
        this.scanEvaluationTime(input, parsed),
      );
      return evaluated.event ? [evaluated.event] : [];
    }
    const events = this.evaluateStoredRule(stored, parsed).map(({ event }) => event);
    await this.rules.recordTestAudit(id, stored.version, events.length);
    return events;
  }

  async scan(input: unknown) {
    const parsed = await this.contexts.prepare(input, true);
    const scanId = parsed.scanId ?? crypto.randomUUID();
    const rules = await this.rules.listEnabledRules();
    const traceId = crypto.randomUUID();
    const evaluatedAt = this.scanEvaluationTime(input, parsed);
    const results: Array<{ ruleId: string; eventId?: string; error?: string }> = [];

    for (const stored of rules) {
      try {
        if (stored.sourcePlanId) {
          await this.evaluateStrategyStoredRule(stored, evaluatedAt, scanId, traceId, results);
          continue;
        }
        for (const { candidate, event } of this.evaluateStoredRule(stored, parsed)) {
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
    return { traceId, scanId, results };
  }

  async evaluateStrategyApplication(applicationId: string, evaluatedAt = new Date()) {
    const rules = (await this.rules.listRules()).filter(
      (rule) => rule.sourcePlanId === applicationId,
    ) as StoredRule[];
    if (rules.length === 0) return { application: null, evaluations: [], persistedEvents: [] };
    const scanId = crypto.randomUUID();
    const traceId = crypto.randomUUID();
    const evaluations = [];
    const persistedEvents: Array<{ ruleId: string; eventId: string }> = [];
    let application: Awaited<ReturnType<StrategyRiskRuntimeService['evaluateStoredRule']>>['application'] | null = null;
    for (const stored of rules) {
      const evaluated = await this.strategyRuntime.evaluateStoredRule(stored, evaluatedAt);
      application = evaluated.application;
      evaluations.push(evaluated.evaluation);
      if (!stored.enabled || !evaluated.application.enabled || !evaluated.event || !evaluated.candidate)
        continue;
      const outcome = await this.events.persist(
        stored,
        evaluated.candidate,
        evaluated.event,
        scanId,
        traceId,
      );
      if (!outcome.eventId) continue;
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
      persistedEvents.push({ ruleId: stored.id, eventId: outcome.eventId });
    }
    return { application, evaluations, persistedEvents };
  }

  history(mode: PortfolioMode = 'actual', options: { cursor?: string; limit?: number } = {}) {
    return this.events.history(mode, options);
  }

  private async evaluateStrategyStoredRule(
    stored: StoredRule,
    evaluatedAt: Date,
    scanId: string,
    traceId: string,
    results: Array<{ ruleId: string; eventId?: string; error?: string }>,
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
        error: `风险已记录，通知排队失败：${notificationError instanceof Error ? notificationError.message : '未知错误'}`,
      });
    }
  }

  private scanEvaluationTime(input: unknown, scan: ParsedScan) {
    if (input !== null && typeof input === 'object' && !Array.isArray(input)) {
      const value = (input as Record<string, unknown>).evaluatedAt;
      if (typeof value === 'string') {
        const parsed = new Date(value);
        if (!Number.isNaN(parsed.getTime())) return parsed;
      }
    }
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

  private evaluateStoredRule(stored: StoredRule, scan: ParsedScan) {
    const rule = this.toRule(stored);
    return this.contexts
      .candidatesForRule(rule, scan)
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
