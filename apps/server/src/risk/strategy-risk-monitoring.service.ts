import { Injectable } from '@nestjs/common';
import { riskAutomaticMonitoringStatusSchema } from '@thesis-ledger/schemas';
import { RedisService, redisKey } from '../platform/redis.service.js';
import { RiskService } from './risk.service.js';
import type { StoredRule } from './risk-types.js';

type RuleIssue = ReturnType<typeof riskAutomaticMonitoringStatusSchema.parse>['ruleIssues'][number];
type ApplicationStatus = { issues: RuleIssue[]; checkedRules: string[] };
const stateKey = redisKey('cache', 'strategy-risk-monitoring');
const healthKey = redisKey('cache', 'risk-monitoring-health');

@Injectable()
export class StrategyRiskMonitoringService {
  constructor(
    private readonly risk: RiskService,
    private readonly redis: RedisService,
  ) {}

  async runNow(rules: StoredRule[], now: Date) {
    const raw = await this.redis.client.get(stateKey);
    const previous = this.readState(raw);
    const next: Record<string, ApplicationStatus> = {};
    let evaluated = false;
    const applications = new Set(
      rules.map((rule) => rule.sourcePlanId).filter((id): id is string => !!id),
    );
    for (const applicationId of applications) {
      const members = rules.filter((rule) => rule.sourcePlanId === applicationId);
      const attemptKey = redisKey('cache', `strategy-risk-monitoring-attempt:${applicationId}`);
      if ((await this.redis.client.set(attemptKey, '1', 'EX', 60, 'NX')) !== 'OK') {
        next[applicationId] = previous[applicationId] ?? { issues: [], checkedRules: [] };
        continue;
      }
      let issues: RuleIssue[];
      evaluated = true;
      try {
        const result = await this.risk.evaluateStrategyApplication(applicationId, now, {
          background: true,
          ruleIds: members.map((rule) => rule.id),
        });
        issues = members.flatMap((rule) => {
          const config = rule.config as { sourceKey?: string; label?: string } | undefined;
          const evaluation = result.evaluations.find(
            (entry) => entry.sourceKey === (config?.sourceKey ?? rule.id),
          );
          if (evaluation && ['triggered', 'not_triggered'].includes(evaluation.state)) return [];
          let state: RuleIssue['state'] = 'unavailable';
          if (!evaluation) state = 'pending';
          else if (evaluation.state === 'not_applicable') state = 'not_applicable';
          else if (
            [
              'evaluation_failed',
              'event_persistence_failed',
              'notification_enqueue_failed',
            ].includes(evaluation.reasonCode ?? '')
          )
            state = 'error';
          return [
            this.issue(
              rule,
              now,
              state,
              evaluation?.reasonCode ?? 'evaluation_pending',
              evaluation?.reason ?? '等待后台完成首次评估',
            ),
          ];
        });
      } catch {
        issues = members.map((rule) =>
          this.issue(rule, now, 'error', 'evaluation_failed', '规则评估失败，等待后台重试'),
        );
      }
      next[applicationId] = {
        issues,
        checkedRules: members.map((rule) => `${rule.id}:${rule.version}`),
      };
    }
    await this.redis.client.set(stateKey, JSON.stringify(next), 'EX', 120);
    await this.redis.client.hset(
      healthKey,
      'strategyRuleIssues',
      JSON.stringify(Object.values(next).flatMap((entry) => entry.issues)),
      'strategyCheckedRules',
      JSON.stringify(Object.values(next).flatMap((entry) => entry.checkedRules)),
      'strategyCheckedAt',
      now.toISOString(),
      ...(evaluated ? ['strategyEvaluatedAt', now.toISOString()] : []),
    );
  }

  private issue(
    rule: StoredRule,
    now: Date,
    state: RuleIssue['state'],
    reasonCode: string,
    reason: string,
  ): RuleIssue {
    const config = rule.config as { label?: string } | undefined;
    return {
      ruleId: rule.id,
      ruleVersion: rule.version,
      applicationId: rule.sourcePlanId ?? null,
      symbol: rule.symbol,
      ruleLabel: config?.label ?? '策略风险规则',
      state,
      reasonCode,
      reason,
      checkedAt: now.toISOString(),
    };
  }

  private readState(raw: string | null): Record<string, ApplicationStatus> {
    if (!raw) return {};
    try {
      const decoded = JSON.parse(raw) as Record<string, ApplicationStatus>;
      return Object.fromEntries(
        Object.entries(decoded).flatMap(([id, value]) => {
          const issues = riskAutomaticMonitoringStatusSchema.shape.ruleIssues.safeParse(
            value?.issues,
          );
          if (!issues.success || !Array.isArray(value?.checkedRules)) return [];
          return [
            [
              id,
              {
                issues: issues.data,
                checkedRules: value.checkedRules.filter((key) => typeof key === 'string'),
              },
            ],
          ];
        }),
      );
    } catch {
      return {};
    }
  }
}
