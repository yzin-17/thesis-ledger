import { Injectable, Optional } from '@nestjs/common';
import { evaluateCompleteRule, type RiskRule } from '@thesis-ledger/domain';
import { NotificationService } from '../notifications/notification.service.js';
import { PrismaService } from '../platform/prisma.service.js';
import { RiskContextService } from './risk-context.service.js';
import { RiskEventService } from './risk-event.service.js';
import { enqueueRiskNotificationIfNeeded, type RiskNotificationInput } from './risk-notification.js';
import { RiskRuleService } from './risk-rule.service.js';
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

  constructor(
    prisma: PrismaService,
    private readonly notifications: NotificationService,
    @Optional() ruleService?: RiskRuleService,
    @Optional() contextService?: RiskContextService,
    @Optional() eventService?: RiskEventService,
  ) {
    this.rules = ruleService ?? new RiskRuleService(prisma);
    this.contexts = contextService ?? new RiskContextService(prisma);
    this.events = eventService ?? new RiskEventService(prisma, notifications);
  }

  createRule(input: unknown) {
    return this.rules.createRule(input);
  }

  listRules() {
    return this.rules.listRules();
  }

  updateRule(id: string, input: unknown) {
    return this.rules.updateRule(id, input);
  }

  archiveRule(id: string) {
    return this.rules.archiveRule(id);
  }

  audit(id: string) {
    return this.rules.audit(id);
  }

  async testRule(id: string, input: unknown) {
    const parsed = await this.contexts.prepare(input, false);
    const stored = await this.rules.getRule(id);
    const events = this.evaluateStoredRule(stored, parsed).map(({ event }) => event);
    await this.rules.recordTestAudit(id, stored.version, events.length);
    return events;
  }

  async scan(input: unknown) {
    const parsed = await this.contexts.prepare(input, true);
    const scanId = parsed.scanId ?? crypto.randomUUID();
    const rules = await this.rules.listEnabledRules();
    const traceId = crypto.randomUUID();
    const results: Array<{ ruleId: string; eventId?: string; error?: string }> = [];

    for (const stored of rules) {
      try {
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

  history(mode: PortfolioMode = 'actual', options: { cursor?: string; limit?: number } = {}) {
    return this.events.history(mode, options);
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
