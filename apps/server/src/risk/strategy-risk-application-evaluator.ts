import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ZodError } from 'zod';
import type { StrategyMonitoringEvaluation } from '@thesis-ledger/domain';
import { NotificationService } from '../notifications/notification.service.js';
import { RiskEventService } from './risk-event.service.js';
import { enqueueRiskNotificationIfNeeded } from './risk-notification.js';
import {
  StrategyRiskRuntimeService,
  type StrategyRiskRuntimeEvaluation,
} from './strategy-risk-runtime.service.js';
import type { StrategyRiskActualContext } from './strategy-risk-context.service.js';
import type { StoredRule } from './risk-types.js';

class ExecutionFailure extends Error {
  constructor(
    readonly code: string,
    reason: string,
  ) {
    super(reason);
  }
}

const executionIssue = (error: unknown) => {
  if (error instanceof ExecutionFailure) return { reasonCode: error.code, reason: error.message };
  if (error instanceof BadRequestException || error instanceof NotFoundException)
    return { reasonCode: 'application_input_invalid', reason: error.message };
  if (error instanceof ZodError)
    return {
      reasonCode: 'rule_definition_invalid',
      reason: '已保存规则配置无效，需要重新生成风险规则',
    };
  return { reasonCode: 'evaluation_failed', reason: '规则评估失败，等待后台重试' };
};

@Injectable()
export class StrategyRiskApplicationEvaluator {
  constructor(
    private readonly runtime: StrategyRiskRuntimeService,
    private readonly events: RiskEventService,
    private readonly notifications: NotificationService,
  ) {}

  async evaluate(rules: StoredRule[], evaluatedAt: Date, background: boolean) {
    const scanId = crypto.randomUUID(),
      traceId = crypto.randomUUID();
    const evaluations: StrategyMonitoringEvaluation[] = [];
    const persistedEvents: Array<{ ruleId: string; eventId: string }> = [];
    const options = {
      background,
      requiresHoldingPeriods: rules.some((rule) => rule.kind === 'max-holding-period'),
      contexts: new Map<string, Promise<StrategyRiskActualContext>>(),
    };
    let application: StrategyRiskRuntimeEvaluation['application'] | null = null;
    for (const rule of rules) {
      try {
        const evaluated = await this.runtime.evaluateStoredRule(rule, evaluatedAt, options);
        application = evaluated.application;
        const eventId = await this.persist(rule, evaluated, scanId, traceId);
        if (eventId) persistedEvents.push({ ruleId: rule.id, eventId });
        evaluations.push(evaluated.evaluation);
      } catch (error) {
        if (!background) throw error;
        const config = rule.config as { sourceKey?: string } | undefined;
        evaluations.push({
          sourceKey: config?.sourceKey ?? rule.id,
          threshold: String(rule.threshold),
          state: 'unavailable',
          ...executionIssue(error),
        });
      }
    }
    return { application, evaluations, persistedEvents };
  }

  private async persist(
    stored: StoredRule,
    evaluated: StrategyRiskRuntimeEvaluation,
    scanId: string,
    traceId: string,
  ) {
    if (
      !stored.enabled ||
      !evaluated.application.enabled ||
      !evaluated.event ||
      !evaluated.candidate
    )
      return;
    let outcome: { eventId?: string; created: boolean };
    try {
      outcome = await this.events.persist(
        stored,
        evaluated.candidate,
        evaluated.event,
        scanId,
        traceId,
      );
    } catch {
      throw new ExecutionFailure('event_persistence_failed', '风险事件保存失败，等待后台重试');
    }
    if (!outcome.eventId) return;
    try {
      await enqueueRiskNotificationIfNeeded(this.notifications, {
        eventId: outcome.eventId,
        severity: evaluated.event.severity,
        message: evaluated.event.message,
        traceId,
        mode: evaluated.candidate.mode,
        created: outcome.created,
        rule: stored,
        policy: evaluated.notification,
        ...(evaluated.candidate.accountId ? { accountId: evaluated.candidate.accountId } : {}),
        ...(evaluated.candidate.symbol ? { symbol: evaluated.candidate.symbol } : {}),
      });
    } catch {
      throw new ExecutionFailure(
        'notification_enqueue_failed',
        '风险已记录，通知排队失败，等待后台重试',
      );
    }
    return outcome.eventId;
  }
}
