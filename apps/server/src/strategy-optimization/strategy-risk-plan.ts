import { BadRequestException } from '@nestjs/common';
import { canonicalStrategyMonitoringJson, compileStrategyMonitoringPlan, type StrategyMonitoringPlan } from '@thesis-ledger/domain';
import { strategySchema, type BacktestStrategy } from '@thesis-ledger/schemas';
import { optimizationSha256 } from './strategy-optimization-common.js';
import type { StrategyRiskNotificationInput } from '@thesis-ledger/schemas';

export function validateRiskRuleOverrides(notification: StrategyRiskNotificationInput, plan: StrategyMonitoringPlan) {
  const keys = new Set(plan.rules.map((rule) => rule.sourceKey));
  if (Object.keys(notification.ruleOverrides ?? {}).some((key) => !keys.has(key)))
    throw new BadRequestException('单条规则通知设置包含不属于当前应用的规则');
}

export function validatedRiskStrategy(
  schema: unknown,
  schemaVersion: number,
  version: number,
): BacktestStrategy {
  if (![2, 3].includes(schemaVersion) || version <= 0)
    throw new BadRequestException('风险应用只能来源于正式 V2 或 V3 策略版本');
  const parsed = strategySchema.safeParse(schema);
  if (!parsed.success || Number(parsed.data.schemaVersion) !== schemaVersion)
    throw new BadRequestException({
      errorCode: 'STRATEGY_RISK_APPLICATION_INVALID_STRATEGY',
      message: '正式策略定义与结构版本不一致或无效，无法安全编译风险监控规则',
    });
  return parsed.data as BacktestStrategy;
}

/** 仅编译真实账户支持的风险语义，不把离场价格或模拟仓位变成真实规则。 */
export function compileRiskApplicationPlan(strategy: BacktestStrategy, strategyVersionId: string) {
  const plan = compileStrategyMonitoringPlan(
    strategy,
    optimizationSha256(strategy),
    strategyVersionId,
  );
  if (plan.coverage.riskMapped !== plan.coverage.riskTotal) {
    throw new BadRequestException({
      errorCode: 'STRATEGY_RISK_APPLICATION_UNSUPPORTED_RULE',
      message: '策略包含尚未支持的风险规则，不能采纳为真实账户监控',
      unsupportedRiskRules: plan.coverage.items
        .filter((item) => item.category === 'risk' && item.status === 'unsupported')
        .map(({ source, reason }) => ({ source, reason })),
    });
  }
  return { ...plan, planHash: optimizationSha256({ ...plan, planHash: undefined }) };
}

export function diffRiskApplicationPlans(beforePlan: StrategyMonitoringPlan, afterPlan: StrategyMonitoringPlan) {
  const before = new Map(beforePlan.rules.map((rule) => [rule.sourceKey, rule]));
  const after = new Map(afterPlan.rules.map((rule) => [rule.sourceKey, rule]));
  const keys = new Set([...before.keys(), ...after.keys()]);
  return [...keys].map((sourceKey) => {
    const left = before.get(sourceKey);
    const right = after.get(sourceKey);
    let change: 'added' | 'removed' | 'changed' | 'unchanged';
    if (!left) change = 'added';
    else if (!right) change = 'removed';
    else if (canonicalStrategyMonitoringJson(left) === canonicalStrategyMonitoringJson(right)) change = 'unchanged';
    else change = 'changed';
    return { sourceKey, before: left ?? null, after: right ?? null, change };
  });
}
